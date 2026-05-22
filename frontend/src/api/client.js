import axios from 'axios'

let _adminPassword = null

export const setAdminPasswordHeader = (pwd) => { _adminPassword = pwd }
export const clearAdminPasswordHeader = () => { _adminPassword = null }

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 15000,
})
api.interceptors.request.use((config) => {
  const tg = window.Telegram?.WebApp
  const initData = tg?.initData || ''
  if (initData) {
    config.headers['Authorization'] = 'tma ' + initData
    config.headers['init-data'] = initData
  }
  const startParam = tg?.initDataUnsafe?.start_param
  if (startParam) {
    config.headers['X-Referrer-Id'] = startParam
  }
  if (_adminPassword) {
    config.headers['X-Admin-Password'] = _adminPassword
  }
  return config
})
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error?.response?.data || error.message)
    return Promise.reject(error)
  }
)
export const getUser = () => api.get('/api/v1/users/me').then((r) => r.data)
export const getMyConfigs = () => api.get('/api/v1/configs/my').then((r) => r.data)
export const getVlessUri = (uuid, isp_name = 'default') =>
  api.get('/api/v1/configs/' + uuid + '/vless', { params: { isp_name } }).then((r) => r.data)
export const createConfig = (data) => api.post('/api/v1/configs/create', data).then((r) => r.data)
export const toggleConfig = (email) => api.put(`/api/v1/configs/${encodeURIComponent(email)}/toggle`).then((r) => r.data)
export const editConfig = (email, data) => api.put(`/api/v1/configs/${encodeURIComponent(email)}/edit`, data).then((r) => r.data)
export const regenerateConfigKey = (email) => api.post(`/api/v1/configs/${encodeURIComponent(email)}/regenerate-key`).then((r) => r.data)
export const deleteConfig = (email) => api.delete(`/api/v1/configs/${encodeURIComponent(email)}`).then((r) => r.data)
export const getPlans = () => api.get('/api/v1/plans/').then((r) => r.data)
export const buyPlanWithWallet = (plan_name, discount_code) =>
  api.post(`/api/v1/plans/${encodeURIComponent(plan_name)}/buy`, null, { params: discount_code ? { discount_code } : {} }).then((r) => r.data)
export const createInvoice = (plan_name, currency = 'USDT', discount_code = null) =>
  api.post('/api/v1/payments/create-invoice', { plan_name, currency, ...(discount_code ? { discount_code } : {}) }).then((r) => r.data)
export const getMyTickets = () => api.get('/api/v1/tickets/my').then((r) => r.data)
export const createTicket = (payload) =>
  api.post('/api/v1/tickets/', payload).then((r) => r.data)
export const replyTicket = (id, text) =>
  api.post('/api/v1/tickets/' + id + '/reply', { text }).then((r) => r.data)
export const getTicket = (id) => api.get('/api/v1/tickets/' + id).then((r) => r.data)
export const getAllTickets = (params) => api.get('/api/v1/tickets/', { params }).then((r) => r.data)
export const updateTicketStatus = (id, status) => api.put('/api/v1/tickets/' + id + '/status', { status }).then((r) => r.data)

// Admin API Methods
export const getAdminStats = () => api.get('/api/v1/admin/stats').then((r) => r.data)
export const syncConfigs = () => api.post('/api/v1/admin/sync-configs').then((r) => r.data)
export const getAllUsers = () => api.get('/api/v1/users/').then((r) => r.data)
export const getAdminUser = (id) => api.get('/api/v1/users/' + id).then((r) => r.data)
export const addBalance = (id, amount) => api.post('/api/v1/users/' + id + '/add_balance?amount=' + amount).then((r) => r.data)
export const updateUserRole = (id, role) => api.put('/api/v1/admin/users/' + id + '/role', { role }).then((r) => r.data)
export const getServers = () => api.get('/api/v1/admin/servers/').then((r) => r.data)
export const testServerConnection = (name) => api.post(`/api/v1/admin/servers/${encodeURIComponent(name)}/test`).then((r) => r.data)
export const getCleanIps = () => api.get('/api/v1/clean-ips/').then((r) => r.data)
export const createCleanIp = (data) => api.post('/api/v1/clean-ips/', data).then((r) => r.data)
export const deleteCleanIp = (isp, ip) => api.delete(`/api/v1/clean-ips/${isp}/${ip}`).then((r) => r.data)
export const createPlan = (data) => api.post('/api/v1/plans/', data).then((r) => r.data)
export const updatePlan = (name, data) => api.put(`/api/v1/plans/${encodeURIComponent(name)}`, data).then((r) => r.data)
export const deletePlan = (name) => api.delete('/api/v1/plans/' + name).then((r) => r.data)
export const getDiscounts = () => api.get('/api/v1/discounts/').then((r) => r.data)
export const createDiscount = (data) => api.post('/api/v1/discounts/', data).then((r) => r.data)
export const deleteDiscount = (code) => api.delete('/api/v1/discounts/' + code).then((r) => r.data)

export const getMyLoans = () => api.get('/api/v1/loans/my').then((r) => r.data)
export const payLoan = (loanId) => api.post(`/api/v1/loans/${loanId}/pay`).then((r) => r.data)
export const adminAllocateLoan = (data) => api.post('/api/v1/loans/admin/allocate', data).then((r) => r.data)
export const adminGetUserLoans = (telegramId) => api.get(`/api/v1/loans/admin/user/${telegramId}`).then((r) => r.data)
export const adminSearchUsers = (q) => api.get('/api/v1/admin/users/search', { params: { q } }).then((r) => r.data)

export const validateDiscount = (code) =>
  api.get(`/api/v1/discounts/validate/${encodeURIComponent(code)}`).then((r) => r.data)

export const verifyAdminPassword = (password) =>
  api.post('/api/v1/admin/verify-password', { password }).then((r) => r.data)
export const setAdminPasswordForUser = (telegramId, password) =>
  api.put(`/api/v1/admin/users/${telegramId}/set-admin-password`, { password }).then((r) => r.data)

export const sendConfigToBot = (configUuid, password) => api.post(`/api/v1/configs/${configUuid}/send-to-bot`, null, { params: { password } }).then((r) => r.data)
export const downloadConfigZip = (configUuid, password) =>
  api.post(`/api/v1/configs/${configUuid}/download-zip`, null, {
    params: { password },
    responseType: 'blob',
  }).then((r) => r.data)

export default api
