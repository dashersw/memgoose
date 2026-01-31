let _counter = Math.floor(Math.random() * 0xffffff)

export class ObjectId {
  private id: string
  public _id: this // Make ObjectId compatible with Document interface
  public readonly _bsontype = 'ObjectId' as const // For mongoose/bson type detection

  constructor(id?: string | number | ObjectId) {
    if (id !== undefined && id !== null) {
      if (id instanceof ObjectId) {
        // Copy from another ObjectId
        this.id = id.toString()
      } else if (typeof id === 'number') {
        // Create from Unix timestamp (seconds)
        this.id = ObjectId.createFromTime(id).toString()
      } else {
        // Create from hex string
        if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new Error('Invalid ObjectId')
        this.id = id.toLowerCase()
      }
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

  /**
   * Creates an ObjectId from a Unix timestamp (seconds since epoch).
   * The remaining bytes are set to zero.
   */
  static createFromTime(time: number): ObjectId {
    const timestamp = Math.floor(time).toString(16).padStart(8, '0')
    // Fill remaining 16 characters (8 bytes) with zeros
    const hexString = timestamp + '0000000000000000'
    return new ObjectId(hexString)
  }

  /**
   * Creates an ObjectId from a 24-character hex string.
   * Explicit factory method matching mongoose API.
   */
  static createFromHexString(hexString: string): ObjectId {
    if (!/^[0-9a-fA-F]{24}$/.test(hexString)) {
      throw new Error('Invalid ObjectId hex string')
    }
    return new ObjectId(hexString)
  }

  toString(): string {
    return this.id
  }

  /**
   * Returns the ObjectId as a 24-character hex string.
   * Alias for toString() - matches mongoose/bson API.
   */
  toHexString(): string {
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

  /**
   * Custom inspect for Node.js util.inspect()
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `ObjectId("${this.id}")`
  }

  static isValid(id: unknown): boolean {
    if (!id) return false
    const idStr = id instanceof ObjectId ? id.toString() : String(id)
    return /^[0-9a-fA-F]{24}$/.test(idStr)
  }
}
