import axios from 'axios'
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
export const renewConfig = (uuid, plan_name) =>
  api.post('/api/v1/configs/' + uuid + '/renew', { plan_name }).then((r) => r.data)
export const getPlans = () => api.get('/api/v1/plans/').then((r) => r.data)
export const createInvoice = (plan_name, currency = 'USDT') =>
  api.post('/api/v1/payments/create-invoice', { plan_name, currency }).then((r) => r.data)
export const getMyTickets = () => api.get('/api/v1/tickets/my').then((r) => r.data)
export const createTicket = (initial_message) =>
  api.post('/api/v1/tickets/', { initial_message }).then((r) => r.data)
export const replyTicket = (id, text) =>
  api.post('/api/v1/tickets/' + id + '/reply', { text }).then((r) => r.data)
export const getTicket = (id) => api.get('/api/v1/tickets/' + id).then((r) => r.data)

// Admin API Methods
export const getAdminStats = () => api.get('/api/v1/admin/stats').then((r) => r.data)
export const syncConfigs = () => api.post('/api/v1/admin/sync-configs').then((r) => r.data)
export const getAllUsers = () => api.get('/api/v1/users/').then((r) => r.data)
export const getAdminUser = (id) => api.get('/api/v1/users/' + id).then((r) => r.data)
export const addBalance = (id, amount) => api.post('/api/v1/users/' + id + '/add_balance?amount=' + amount).then((r) => r.data)
export const updateUserRole = (id, role) => api.put('/api/v1/admin/users/' + id + '/role', { role }).then((r) => r.data)
export const getServers = () => api.get('/api/v1/clean-ips/servers').then((r) => r.data)
export const createServer = (data) => api.post('/api/v1/clean-ips/servers', data).then((r) => r.data)
export const deleteServer = (id) => api.delete('/api/v1/clean-ips/servers/' + id).then((r) => r.data)
export const getCleanIps = () => api.get('/api/v1/clean-ips/').then((r) => r.data)
export const createCleanIp = (data) => api.post('/api/v1/clean-ips/', data).then((r) => r.data)
export const deleteCleanIp = (id) => api.delete('/api/v1/clean-ips/' + id).then((r) => r.data)
export const createPlan = (data) => api.post('/api/v1/plans/', data).then((r) => r.data)
export const deletePlan = (name) => api.delete('/api/v1/plans/' + name).then((r) => r.data)
export const getDiscounts = () => api.get('/api/v1/discounts/').then((r) => r.data)
export const createDiscount = (data) => api.post('/api/v1/discounts/', data).then((r) => r.data)
export const deleteDiscount = (code) => api.delete('/api/v1/discounts/' + code).then((r) => r.data)

export default api
