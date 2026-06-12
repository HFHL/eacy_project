import { createBrowserRouter } from 'react-router-dom'

import { routeConfig, permissionConfig } from './routeConfig'
import { routes } from './routes'

const router = createBrowserRouter(routes)

export { routeConfig, permissionConfig }

export default router
