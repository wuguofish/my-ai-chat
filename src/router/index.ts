/**
 * Vue Router 設定
 */

import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/onboarding'
  },
  {
    path: '/onboarding',
    name: 'Onboarding',
    component: () => import('@/views/onboarding/Index.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/main',
    name: 'Main',
    component: () => import('@/views/main/Index.vue'),
    meta: { requiresAuth: true },
    redirect: '/main/chats',
    children: [
      {
        path: 'chats',
        name: 'ChatList',
        component: () => import('@/views/main/ChatList.vue')
      },
      {
        path: 'chats/:id',
        name: 'ChatRoom',
        component: () => import('@/views/main/ChatRoom.vue')
      },
      {
        path: 'characters',
        name: 'Characters',
        component: () => import('@/views/main/CharacterList.vue')
      },
      {
        path: 'characters/new',
        name: 'CharacterNew',
        component: () => import('@/views/main/CharacterForm.vue')
      },
      {
        path: 'characters/:id',
        name: 'CharacterDetail',
        component: () => import('@/views/main/CharacterDetail.vue')
      },
      {
        path: 'characters/:id/edit',
        name: 'CharacterEdit',
        component: () => import('@/views/main/CharacterForm.vue')
      },
      {
        path: 'characters/:id/memories',
        name: 'MemoryManager',
        component: () => import('@/views/main/MemoryManager.vue')
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/main/Settings.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守衛
router.beforeEach((to, _from, next) => {
  const userStore = useUserStore()

  // 需要已完成設定才能進入
  if (to.meta.requiresAuth && !userStore.isProfileComplete) {
    next('/onboarding')
    return
  }

  // 已完成設定的使用者不應該回到 onboarding
  if (to.meta.requiresGuest && userStore.isProfileComplete) {
    next('/main')
    return
  }

  next()
})

export default router
