let _counter = Math.floor(Math.random() * 0xffffff)

export class ObjectId {
  private id: string
  public _id: this // Make ObjectId compatible with Document interface

  constructor(id?: string) {
    if (id) {
      if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new Error('Invalid ObjectId')
      this.id = id.toLowerCase()
    } else {
      this.id = ObjectId.generate()
    }
    this._id = this
  }

  static generate(): string {
    const timestamp = Math.floor(Date.now() / 1000)
      .toString(16)
      .padStart(8, '0')
    const random = Array.from({ length: 5 }, () =>
      Math.floor(Math.random() * 0xff)
        .toString(16)
        .padStart(2, '0')
    ).join('')
    const counter = (_counter = (_counter + 1) % 0xffffff).toString(16).padStart(6, '0')
    return timestamp + random + counter
  }

  toString(): string {
    return this.id
  }

  toJSON(): string {
    return this.toString()
  }

  equals(other: ObjectId | string | null | undefined): boolean {
    if (!other) return false
    const otherId = other instanceof ObjectId ? other.toString() : other.toString()
    return otherId === this.id
  }

  getTimestamp(): Date {
    const seconds = parseInt(this.id.substring(0, 8), 16)
    return new Date(seconds * 1000)
  }

  static isValid(id: unknown): boolean {
    if (!id) return false
    const idStr = id instanceof ObjectId ? id.toString() : String(id)
    return /^[0-9a-fA-F]{24}$/.test(idStr)
  }
}
