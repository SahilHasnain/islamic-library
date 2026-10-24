export const api = {
  get: async (url, config) => ({ data: {}, status: 200 }),
  post: async (url, data, config) => ({ data: {}, status: 200 }),
  put: async (url, data, config) => ({ data: {}, status: 200 }),
  delete: async (url, config) => ({ data: {}, status: 200 }),
  interceptors: {
    request: { use: () => {} },
    response: { use: () => {} },
  },
};
