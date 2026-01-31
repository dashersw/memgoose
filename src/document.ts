import { ObjectId } from './objectid'

// Document interface - represents a document returned from queries
// with instance methods attached
export interface IDocument {
  _id: ObjectId // Always present on retrieved documents (auto-generated ObjectId if not provided)
  toJSON?(options?: any): any
  toObject?(options?: any): any
  save(): Promise<any>
}

/**
 * Document base class for mongoose compatibility.
 * Can be extended by user classes or used for instanceof checks.
 * This is primarily for mocking/compatibility - actual documents
 * are plain objects with methods attached by the Model.
 */
export class Document implements IDocument {
  _id!: ObjectId

  // These methods are typically overridden by the Model when attaching to documents
  toJSON(_options?: any): any {
    const obj = { ...this }
    // Remove internal properties if any
    return obj
  }

  toObject(_options?: any): any {
    return { ...this }
  }

  async save(): Promise<this> {
    // This is a stub - actual save logic is attached by Model
    throw new Error('save() must be called on a document retrieved from a Model')
  }
}

// Keep backward compatibility - Document type alias
export type { IDocument as DocumentInterface }
