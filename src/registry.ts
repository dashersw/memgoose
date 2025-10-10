import { Model } from './model'

// Global model registry for populate support
const modelRegistry = new Map<string, Model<any>>()

export function registerModel(name: string, model: Model<any>): void {
  modelRegistry.set(name, model)
}

export function getModel(name: string): Model<any> | undefined {
  return modelRegistry.get(name)
}

export function clearRegistry(): void {
  modelRegistry.clear()
}
