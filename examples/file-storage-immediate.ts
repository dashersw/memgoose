// Example demonstrating immediate persistence mode
import { createDatabase, Schema } from '../index'

interface TaskDoc {
  title: string
  completed: boolean
  priority: number
}

const taskSchema = new Schema<TaskDoc>({
  title: { type: String, required: true },
  completed: { type: Boolean, default: false },
  priority: { type: Number, default: 1 }
})

// Create database with immediate persistence mode
const taskDb = createDatabase({
  storage: 'file',
  file: {
    dataPath: './data',
    persistMode: 'immediate' // Every change writes to disk immediately
  }
})

// Create model using the database
const Task = taskDb.model('Task', taskSchema)

async function demo() {
  console.log('Immediate File Storage Demo')
  console.log('============================\n')

  // Each operation will be written to disk immediately
  console.log('Creating tasks with immediate persistence...')
  await Task.create({ title: 'Buy groceries', priority: 2 })
  await Task.create({ title: 'Write documentation', priority: 1 })
  await Task.create({ title: 'Fix bug #123', priority: 3 })

  console.log('✓ Each task was written to disk immediately after creation\n')

  // Update task
  const task = await Task.findOne({ title: 'Buy groceries' })
  if (task) {
    task.completed = true
    await task.save()
    console.log('✓ Task marked as completed and persisted immediately')
  }

  // Query all tasks
  const allTasks = await Task.find().sort({ priority: -1 })
  console.log('\nAll tasks (sorted by priority):')
  allTasks.forEach(t => {
    console.log(`  - [${t.completed ? '✓' : ' '}] ${t.title} (priority: ${t.priority})`)
  })

  console.log('\n✓ All changes have been immediately persisted to ./data/Task.json')
}

demo().catch(console.error)
