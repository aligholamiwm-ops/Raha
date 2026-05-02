import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const tg = window.Telegram?.WebApp
  const initData = tg?.initData || ''

  if (initData) {
    config.headers['Authorization'] = `tma ${initData}`
  } else {
    console.warn(
      '[Raha] window.Telegram.WebApp.initData is empty. ' +
      'Make sure the app is opened via a web_app button inside Telegram, not a plain URL.'
    )
  }

  // Referral: read start_param set by bot /start deeplink
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
  api.get(`/api/v1/configs/${uuid}/vless`, { params: { isp_name } }).then((r) => r.data)

export const renewConfig = (uuid, plan_name) =>
  api.post(`/api/v1/configs/${uuid}/renew`, { plan_name }).then((r) => r.data)

export const getPlans = () => api.get('/api/v1/plans/').then((r) => r.data)

export const createInvoice = (plan_name, currency = 'USDT') =>
  api.post('/api/v1/payments/create-invoice', { plan_name, currency }).then((r) => r.data)

export const getMyTickets = () => api.get('/api/v1/tickets/my').then((r) => r.data)

export const createTicket = (initial_message) =>
  api.post('/api/v1/tickets/', { initial_message }).then((r) => r.data)

export const replyTicket = (id, text) =>
  api.post(`/api/v1/tickets/${id}/reply`, { text }).then((r) => r.data)

export const getTicket = (id) => api.get(`/api/v1/tickets/${id}`).then((r) => r.data)

export default api
