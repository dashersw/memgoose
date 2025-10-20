import { ObjectId } from './objectid'

// Document interface - represents a document returned from queries
// with instance methods attached
export interface Document {
  _id: ObjectId // Always present on retrieved documents (auto-generated ObjectId if not provided)
  toJSON?(options?: any): any
  toObject?(options?: any): any
  save(): Promise<any>
}
