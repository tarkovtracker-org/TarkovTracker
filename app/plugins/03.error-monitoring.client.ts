import { logger } from '@/utils/logger';
export default defineNuxtPlugin((nuxtApp) => {
  const previousErrorHandler = nuxtApp.vueApp.config.errorHandler;
  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    const componentType = instance?.$?.type;
    const componentName =
      typeof componentType === 'object' &&
      componentType &&
      'name' in componentType &&
      typeof componentType.name === 'string'
        ? componentType.name
        : null;
    logger.error('[VueError]', {
      componentName,
      error,
      info,
      route: window.location.pathname,
    });
    previousErrorHandler?.(error, instance, info);
  };
  const onWindowError = (event: ErrorEvent) => {
    logger.error('[WindowError]', {
      error: event.error,
      filename: event.filename,
      line: event.lineno,
      message: event.message,
      route: window.location.pathname,
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    logger.error('[UnhandledRejection]', {
      reason: event.reason,
      route: window.location.pathname,
    });
  };
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    });
  }
});
