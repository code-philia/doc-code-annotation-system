import axios from 'axios';
import { Annotation } from '../types';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
});

export const uploadDocument = async (file: File) => {
  // 临时模拟服务器响应
  return {
    id: Date.now().toString(),
    name: file.name
  };
};

export const uploadCode = async (file: File) => {
  // 临时模拟服务器响应
  return {
    id: Date.now().toString(),
    name: file.name
  };
};

export const createAnnotation = async (data: {
  category: string;
  documentRanges: { start: number; end: number; content: string }[];
  codeRanges: { start: number; end: number; content: string }[];
}) => {
  const response = await api.post('/api/annotations', data);
  return response.data;
};

export const saveAnnotation = async (id: string, annotation: Annotation): Promise<void> => {
  await api.post(`/api/annotations/${id}/save`, annotation);
};

export const getAnnotation = async (id: string): Promise<Annotation> => {
  const response = await api.get(`/api/annotations/${id}`);
  return response.data;
};

export const getAnnotations = async () => {
  const response = await api.get('/api/annotations');
  return response.data;
};

export const generateAIAnnotation = async (data: {
  documentContent: string;
  codeContent: string;
}) => {
  const response = await api.post('/api/annotations/generate', data);
  return response.data;
}; 