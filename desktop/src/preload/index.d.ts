export {}

declare global {
  interface Window {
    cheezy: import('../preload/index').CheezyApi
  }
}
