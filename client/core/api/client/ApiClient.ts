import axios, { AxiosInstance } from 'axios';
import { logger } from '../../logger/Logger';

class ApiClient {
  private static instance: ApiClient;
  private axiosInstance: AxiosInstance;

  private constructor() {
    this.axiosInstance = axios.create({
      baseURL: '/api',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  private setupInterceptors() {
    this.axiosInstance.interceptors.request.use(config => {
      logger.trace('API', `Request: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    this.axiosInstance.interceptors.response.use(
      response => response,
      error => {
        logger.error('API', `System error on ${error.config?.url}`, error.message);
        return Promise.reject(error);
      }
    );
  }

  public get<T>(url: string, config?: any): Promise<T> {
    return this.axiosInstance.get(url, config).then(res => res.data);
  }

  public post<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.axiosInstance.post(url, data, config).then(res => res.data);
  }
}

export const apiClient = ApiClient.getInstance();
