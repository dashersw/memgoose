// Base QueryBuilder class - all queries have exec()
export class QueryBuilder<TResult> implements PromiseLike<TResult> {
  protected _operation: () => Promise<TResult>

  constructor(operation: () => Promise<TResult>) {
    this._operation = operation
  }

  async exec(): Promise<TResult> {
    return this._operation()
  }

  // Make QueryBuilder thenable so it can be awaited (Mongoose does this!)
  then<TResult1 = TResult, TResult2 = never>(
    onfulfilled?: ((value: TResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected)
  }
}
