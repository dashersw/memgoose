type FunctionLike = (...args: unknown[]) => unknown

type FunctionKeys<T> = {
  [K in keyof T]-?: Extract<T[K], FunctionLike> extends never ? never : K
}[keyof T]

export type QueryableKeys<T> = Exclude<keyof T, FunctionKeys<T>>
