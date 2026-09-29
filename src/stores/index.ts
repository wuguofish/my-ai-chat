/**
 * Pinia Store 入口
 */

import { createPinia } from 'pinia'
import { persistPlugin } from './plugins/persist'

const pinia = createPinia()
pinia.use(persistPlugin)

export default pinia
