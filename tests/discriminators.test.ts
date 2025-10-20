import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model, clearRegistry } from '../index'

interface AnimalDoc {
  name: string
  age: number
}

interface DogDoc extends AnimalDoc {
  breed: string
  goodBoy: boolean
}

interface CatDoc extends AnimalDoc {
  indoor: boolean
  livesLeft: number
}

test('Discriminators', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should create discriminator model', async () => {
    clearRegistry()

    const animalSchema = new Schema<AnimalDoc>(
      {
        name: String,
        age: Number
      },
      { discriminatorKey: '__t' }
    )

    const dogSchema = new Schema<DogDoc>({
      breed: String,
      goodBoy: Boolean
    })

    const Animal = model('Animal', animalSchema)
    const Dog = Animal.discriminator<DogDoc>('Dog', dogSchema)

    const dog = await Dog.create({
      name: 'Buddy',
      age: 3,
      breed: 'Golden Retriever',
      goodBoy: true
    })

    assert.strictEqual(dog.name, 'Buddy')
    assert.strictEqual(dog.breed, 'Golden Retriever')
    assert.strictEqual((dog as any).__t, 'Dog')
  })

  await t.test('should share data between base and discriminator models', async () => {
    clearRegistry()

    const animalSchema = new Schema<AnimalDoc>({
      name: String,
      age: Number
    })

    const dogSchema = new Schema<DogDoc>({
      breed: String,
      goodBoy: Boolean
    })

    const catSchema = new Schema<CatDoc>({
      indoor: Boolean,
      livesLeft: Number
    })

    const Animal = model('Animal', animalSchema)
    const Dog = Animal.discriminator<DogDoc>('Dog', dogSchema)
    const Cat = Animal.discriminator<CatDoc>('Cat', catSchema)

    await Dog.create({ name: 'Buddy', age: 3, breed: 'Golden Retriever', goodBoy: true })
    await Cat.create({ name: 'Whiskers', age: 2, indoor: true, livesLeft: 9 })

    const allAnimals = await Animal.find()
    assert.strictEqual(allAnimals.length, 2)

    const dogs = await Dog.find()
    assert.strictEqual(dogs.length, 1)
    assert.strictEqual(dogs[0].name, 'Buddy')

    const cats = await Cat.find()
    assert.strictEqual(cats.length, 1)
    assert.strictEqual(cats[0].name, 'Whiskers')
  })

  await t.test('should validate discriminator-specific fields', async () => {
    clearRegistry()

    const animalSchema = new Schema<AnimalDoc>({
      name: { type: String, required: true },
      age: Number
    })

    const dogSchema = new Schema<DogDoc>({
      breed: { type: String, required: true },
      goodBoy: Boolean
    })

    const Animal = model('Animal', animalSchema)
    const Dog = Animal.discriminator<DogDoc>('Dog', dogSchema)

    await assert.rejects(
      async () => {
        await Dog.create({ name: 'Buddy', age: 3, goodBoy: true }) // Missing required breed
      },
      {
        name: 'ValidationError',
        message: /breed is required/
      }
    )
  })

  await t.test('should filter queries by discriminator type', async () => {
    clearRegistry()

    const animalSchema = new Schema<AnimalDoc>({
      name: String,
      age: Number
    })

    const dogSchema = new Schema<DogDoc>({
      breed: String,
      goodBoy: Boolean
    })

    const Animal = model('Animal', animalSchema)
    const Dog = Animal.discriminator<DogDoc>('Dog', dogSchema)

    await Dog.create({ name: 'Rex', age: 5, breed: 'German Shepherd', goodBoy: true })
    await Animal.create({ name: 'Generic Animal', age: 10 })

    const dogs = await Dog.find()
    assert.strictEqual(dogs.length, 1)
    assert.strictEqual(dogs[0].name, 'Rex')

    const animals = await Animal.find()
    assert.strictEqual(animals.length, 2) // Both dog and generic animal
  })

  await t.test('should use custom discriminator key', async () => {
    clearRegistry()

    const animalSchema = new Schema<AnimalDoc>(
      {
        name: String,
        age: Number
      },
      { discriminatorKey: 'kind' }
    )

    const dogSchema = new Schema<DogDoc>({
      breed: String,
      goodBoy: Boolean
    })

    const Animal = model('Animal', animalSchema)
    const Dog = Animal.discriminator<DogDoc>('Dog', dogSchema)

    const dog = await Dog.create({ name: 'Max', age: 4, breed: 'Labrador', goodBoy: true })

    assert.strictEqual((dog as any).kind, 'Dog')
    assert.strictEqual((dog as any).__t, undefined)
  })

  await t.test('should support multiple discriminators', async () => {
    clearRegistry()

    const animalSchema = new Schema<AnimalDoc>({
      name: String,
      age: Number
    })

    const dogSchema = new Schema<DogDoc>({
      breed: String,
      goodBoy: Boolean
    })

    const catSchema = new Schema<CatDoc>({
      indoor: Boolean,
      livesLeft: Number
    })

    const Animal = model('Animal', animalSchema)
    const Dog = Animal.discriminator<DogDoc>('Dog', dogSchema)
    const Cat = Animal.discriminator<CatDoc>('Cat', catSchema)

    await Dog.create({ name: 'Buddy', age: 3, breed: 'Beagle', goodBoy: true })
    await Cat.create({ name: 'Fluffy', age: 5, indoor: true, livesLeft: 7 })
    await Cat.create({ name: 'Shadow', age: 1, indoor: false, livesLeft: 9 })

    const allAnimals = await Animal.find()
    assert.strictEqual(allAnimals.length, 3)

    const dogs = await Dog.find()
    assert.strictEqual(dogs.length, 1)

    const cats = await Cat.find()
    assert.strictEqual(cats.length, 2)
  })

  await t.test('discriminator should inherit base model methods', async () => {
    clearRegistry()

    const animalSchema = new Schema<AnimalDoc>({
      name: String,
      age: Number
    })

    animalSchema.methods.getInfo = function (this: AnimalDoc) {
      return `${this.name} is ${this.age} years old`
    }

    const dogSchema = new Schema<DogDoc>({
      breed: String,
      goodBoy: Boolean
    })

    dogSchema.methods.bark = function () {
      return 'Woof!'
    }

    const Animal = model('Animal', animalSchema)
    const Dog = Animal.discriminator<DogDoc>('Dog', dogSchema)

    const dog = await Dog.create({ name: 'Rex', age: 4, breed: 'Husky', goodBoy: true })

    // Should have both base and discriminator methods
    assert.strictEqual((dog as any).getInfo(), 'Rex is 4 years old')
    assert.strictEqual((dog as any).bark(), 'Woof!')
  })

  await t.test('should throw error when creating discriminator without base schema', async () => {
    clearRegistry()

    const dogSchema = new Schema({
      breed: String
    })

    // Create a Model and remove its schema to test error case
    const BaseModel = model('BaseModel', new Schema({ name: String }))
    ;(BaseModel as any)._schema = undefined

    assert.throws(
      () => {
        BaseModel.discriminator('Dog', dogSchema)
      },
      {
        message: /Cannot create discriminator without base schema/
      }
    )
  })

  await t.test(
    'discriminator should copy indexes from both base and discriminator schemas',
    async () => {
      clearRegistry()

      const animalSchema = new Schema<AnimalDoc>({
        name: String,
        age: Number
      })

      animalSchema.index('name')

      const dogSchema = new Schema<DogDoc>({
        breed: String,
        goodBoy: Boolean
      })

      dogSchema.index('breed')

      const Animal = model('Animal', animalSchema)
      const Dog = Animal.discriminator<DogDoc>('Dog', dogSchema)

      await Dog.insertMany([
        { name: 'Max', age: 3, breed: 'Labrador', goodBoy: true },
        { name: 'Bella', age: 5, breed: 'Golden Retriever', goodBoy: true },
        { name: 'Rex', age: 2, breed: 'Labrador', goodBoy: true }
      ])

      // Should be able to use both indexes
      const byName = await Dog.findOne({ name: 'Max' })
      assert.strictEqual(byName?.name, 'Max')

      const labradors = await Dog.find({ breed: 'Labrador' })
      assert.strictEqual(labradors.length, 2)
    }
  )

  await t.test('discriminator with insertMany should apply discriminator key', async () => {
    clearRegistry()

    const animalSchema = new Schema<AnimalDoc>({
      name: String,
      age: Number
    })

    const catSchema = new Schema<CatDoc>({
      indoor: Boolean,
      livesLeft: Number
    })

    const Animal = model('Animal', animalSchema)
    const Cat = Animal.discriminator<CatDoc>('Cat', catSchema)

    const cats = await Cat.insertMany([
      { name: 'Whiskers', age: 2, indoor: true, livesLeft: 9 },
      { name: 'Shadow', age: 1, indoor: false, livesLeft: 9 }
    ])

    // All should have discriminator key
    assert.strictEqual((cats[0] as any).__t, 'Cat')
    assert.strictEqual((cats[1] as any).__t, 'Cat')
  })

  await t.test('discriminator with setters should apply them via insertMany', async () => {
    clearRegistry()

    const animalSchema = new Schema<AnimalDoc>({
      name: {
        type: String,
        set: (v: string) => v.toUpperCase()
      },
      age: Number
    })

    const dogSchema = new Schema<DogDoc>({
      breed: String,
      goodBoy: Boolean
    })

    const Animal = model('Animal', animalSchema)
    const Dog = Animal.discriminator<DogDoc>('Dog', dogSchema)

    const dogs = await Dog.insertMany([
      { name: 'buddy', age: 3, breed: 'Beagle', goodBoy: true },
      { name: 'max', age: 5, breed: 'Pug', goodBoy: true }
    ])

    // Setters should have been applied
    assert.strictEqual(dogs[0].name, 'BUDDY')
    assert.strictEqual(dogs[1].name, 'MAX')
  })

  await t.test('discriminator with save should apply setters and discriminator key', async () => {
    clearRegistry()

    const animalSchema = new Schema<AnimalDoc>({
      name: {
        type: String,
        set: (v: string) => v.toUpperCase()
      },
      age: Number
    })

    const catSchema = new Schema<CatDoc>({
      indoor: Boolean,
      livesLeft: Number
    })

    const Animal = model('Animal', animalSchema)
    const Cat = Animal.discriminator<CatDoc>('Cat', catSchema)

    const saved = await Cat.create({ name: 'fluffy', age: 3, indoor: true, livesLeft: 9 })

    // Setter should have been applied
    assert.strictEqual(saved.name, 'FLUFFY')

    // Discriminator key should be set
    assert.strictEqual((saved as any).__t, 'Cat')
  })
})
