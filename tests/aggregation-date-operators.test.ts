import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

describe('Aggregation Date Operators', () => {
  interface EventInterface {
    name: string
    timestamp: Date
    endTime?: Date
  }

  const eventSchema = new Schema<EventInterface>({
    name: String,
    timestamp: Date,
    endTime: Date
  })

  const Event = model<EventInterface>('Event', eventSchema)

  beforeEach(async () => {
    await Event.deleteMany({})
  })

  describe('Date extraction operators', () => {
    it('should extract year from date', async () => {
      await Event.insertMany([
        { name: 'Event1', timestamp: new Date('2024-06-15T10:30:00Z') },
        { name: 'Event2', timestamp: new Date('2023-12-25T15:45:00Z') }
      ])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            year: { $year: '$timestamp' }
          }
        }
      ])

      assert.strictEqual(results[0].year, 2024)
      assert.strictEqual(results[1].year, 2023)
    })

    it('should extract month from date', async () => {
      await Event.insertMany([
        { name: 'Event1', timestamp: new Date('2024-01-15T10:30:00Z') },
        { name: 'Event2', timestamp: new Date('2024-12-25T15:45:00Z') }
      ])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            month: { $month: '$timestamp' }
          }
        }
      ])

      assert.strictEqual(results[0].month, 1)
      assert.strictEqual(results[1].month, 12)
    })

    it('should extract day of month', async () => {
      await Event.insertMany([
        { name: 'Event1', timestamp: new Date('2024-06-01T10:30:00Z') },
        { name: 'Event2', timestamp: new Date('2024-06-15T15:45:00Z') },
        { name: 'Event3', timestamp: new Date('2024-06-30T20:00:00Z') }
      ])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            day: { $dayOfMonth: '$timestamp' }
          }
        }
      ])

      assert.strictEqual(results[0].day, 1)
      assert.strictEqual(results[1].day, 15)
      assert.strictEqual(results[2].day, 30)
    })

    it('should extract day of week', async () => {
      await Event.insertMany([
        { name: 'Sunday', timestamp: new Date('2024-06-16T10:00:00Z') }, // Sunday
        { name: 'Monday', timestamp: new Date('2024-06-17T10:00:00Z') }, // Monday
        { name: 'Saturday', timestamp: new Date('2024-06-22T10:00:00Z') } // Saturday
      ])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            dayOfWeek: { $dayOfWeek: '$timestamp' }
          }
        }
      ])

      // MongoDB: 1=Sunday, 2=Monday, ..., 7=Saturday
      assert.strictEqual(results[0].dayOfWeek, 1) // Sunday
      assert.strictEqual(results[1].dayOfWeek, 2) // Monday
      assert.strictEqual(results[2].dayOfWeek, 7) // Saturday
    })

    it('should extract hour, minute, second, millisecond', async () => {
      await Event.insertMany([{ name: 'Event1', timestamp: new Date('2024-06-15T14:25:37.123Z') }])

      const results = await Event.aggregate([
        {
          $project: {
            hour: { $hour: '$timestamp' },
            minute: { $minute: '$timestamp' },
            second: { $second: '$timestamp' },
            millisecond: { $millisecond: '$timestamp' }
          }
        }
      ])

      assert.strictEqual(results[0].hour, 14)
      assert.strictEqual(results[0].minute, 25)
      assert.strictEqual(results[0].second, 37)
      assert.strictEqual(results[0].millisecond, 123)
    })

    it('should extract day of year', async () => {
      await Event.insertMany([
        { name: 'New Year', timestamp: new Date('2024-01-01T00:00:00Z') },
        { name: 'Mid Year', timestamp: new Date('2024-07-01T00:00:00Z') }
      ])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            dayOfYear: { $dayOfYear: '$timestamp' }
          }
        }
      ])

      assert.strictEqual(results[0].dayOfYear, 1)
      assert.ok((results[1].dayOfYear as number) > 180) // July 1st is past day 180
    })

    it('should extract week of year', async () => {
      await Event.insertMany([
        { name: 'Event1', timestamp: new Date('2024-01-01T00:00:00Z') }, // Week 1
        { name: 'Event2', timestamp: new Date('2024-07-15T00:00:00Z') } // Mid-year week
      ])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            week: { $week: '$timestamp' }
          }
        }
      ])

      assert.ok((results[0].week as number) >= 0 && (results[0].week as number) <= 53)
      assert.ok((results[1].week as number) >= 20) // Mid-year should be week 20+
    })

    it('should extract ISO week and year', async () => {
      await Event.insertMany([{ name: 'Event1', timestamp: new Date('2024-01-15T00:00:00Z') }])

      const results = await Event.aggregate([
        {
          $project: {
            isoWeek: { $isoWeek: '$timestamp' },
            isoWeekYear: { $isoWeekYear: '$timestamp' }
          }
        }
      ])

      assert.ok((results[0].isoWeek as number) >= 1 && (results[0].isoWeek as number) <= 53)
      assert.strictEqual(results[0].isoWeekYear, 2024)
    })
  })

  describe('Date formatting', () => {
    it('should format date to string with default ISO format', async () => {
      const testDate = new Date('2024-06-15T14:25:37.000Z')
      await Event.insertMany([{ name: 'Event1', timestamp: testDate }])

      const results = await Event.aggregate([
        {
          $project: {
            formatted: { $dateToString: { date: '$timestamp' } }
          }
        }
      ])

      assert.strictEqual(results[0].formatted, testDate.toISOString())
    })

    it('should format date with custom format', async () => {
      await Event.insertMany([{ name: 'Event1', timestamp: new Date('2024-06-15T14:25:37.123Z') }])

      const results = await Event.aggregate([
        {
          $project: {
            formatted: { $dateToString: { date: '$timestamp', format: '%Y-%m-%d %H:%M:%S' } }
          }
        }
      ])

      assert.strictEqual(results[0].formatted, '2024-06-15 14:25:37')
    })

    it('should parse date from string', async () => {
      await Event.insertMany([{ name: 'Event1', timestamp: new Date('2024-01-01') }])

      const results = await Event.aggregate([
        {
          $project: {
            dateStr: { $dateToString: { date: '$timestamp', format: '%Y-%m-%d' } }
          }
        },
        {
          $project: {
            parsedDate: { $dateFromString: { dateString: '$dateStr' } }
          }
        }
      ])

      assert.ok(results[0].parsedDate instanceof Date)
    })
  })

  describe('Date arithmetic', () => {
    it('should add time to date with $dateAdd', async () => {
      const startDate = new Date('2024-01-01T00:00:00Z')
      await Event.insertMany([{ name: 'Event1', timestamp: startDate }])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            plusDays: { $dateAdd: { startDate: '$timestamp', unit: 'day', amount: 5 } },
            plusMonths: { $dateAdd: { startDate: '$timestamp', unit: 'month', amount: 2 } },
            plusYears: { $dateAdd: { startDate: '$timestamp', unit: 'year', amount: 1 } }
          }
        }
      ])

      const result = results[0]
      assert.ok(result.plusDays instanceof Date)
      assert.strictEqual((result.plusDays as Date).getUTCDate(), 6)
      assert.strictEqual((result.plusMonths as Date).getUTCMonth(), 2) // March (0-indexed)
      assert.strictEqual((result.plusYears as Date).getUTCFullYear(), 2025)
    })

    it('should add time units (minute, second, millisecond) with $dateAdd', async () => {
      const startDate = new Date('2024-01-01T10:30:45.500Z')
      await Event.insertMany([{ name: 'Event1', timestamp: startDate }])

      const results = await Event.aggregate([
        {
          $project: {
            plusMinutes: { $dateAdd: { startDate: '$timestamp', unit: 'minute', amount: 15 } },
            plusSeconds: { $dateAdd: { startDate: '$timestamp', unit: 'second', amount: 30 } },
            plusMillis: { $dateAdd: { startDate: '$timestamp', unit: 'millisecond', amount: 250 } }
          }
        }
      ])

      const result = results[0]
      assert.strictEqual((result.plusMinutes as Date).getUTCMinutes(), 45)
      assert.strictEqual((result.plusSeconds as Date).getUTCSeconds(), 15)
      assert.strictEqual((result.plusMillis as Date).getUTCMilliseconds(), 750)
    })

    it('should subtract time from date with $dateSubtract', async () => {
      const startDate = new Date('2024-06-15T12:30:00Z')
      await Event.insertMany([{ name: 'Event1', timestamp: startDate }])

      const results = await Event.aggregate([
        {
          $project: {
            minusDays: { $dateSubtract: { startDate: '$timestamp', unit: 'day', amount: 5 } },
            minusHours: { $dateSubtract: { startDate: '$timestamp', unit: 'hour', amount: 2 } }
          }
        }
      ])

      assert.strictEqual((results[0].minusDays as Date).getUTCDate(), 10)
      assert.strictEqual((results[0].minusHours as Date).getUTCHours(), 10)
    })

    it('should calculate date difference with $dateDiff', async () => {
      await Event.insertMany([
        {
          name: 'Event1',
          timestamp: new Date('2024-01-01T00:00:00Z'),
          endTime: new Date('2024-01-10T00:00:00Z')
        },
        {
          name: 'Event2',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T14:00:00Z')
        }
      ])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            daysDiff: { $dateDiff: { startDate: '$timestamp', endDate: '$endTime', unit: 'day' } },
            hoursDiff: { $dateDiff: { startDate: '$timestamp', endDate: '$endTime', unit: 'hour' } }
          }
        }
      ])

      assert.strictEqual(results[0].daysDiff, 9)
      assert.strictEqual(results[1].hoursDiff, 4)
    })

    it('should calculate date difference with all time units', async () => {
      await Event.insertMany([
        {
          name: 'Event1',
          timestamp: new Date('2022-01-15T10:30:45.100Z'),
          endTime: new Date('2024-06-20T14:35:50.250Z')
        }
      ])

      const results = await Event.aggregate([
        {
          $project: {
            yearsDiff: {
              $dateDiff: { startDate: '$timestamp', endDate: '$endTime', unit: 'year' }
            },
            monthsDiff: {
              $dateDiff: { startDate: '$timestamp', endDate: '$endTime', unit: 'month' }
            },
            daysDiff: { $dateDiff: { startDate: '$timestamp', endDate: '$endTime', unit: 'day' } },
            hoursDiff: {
              $dateDiff: { startDate: '$timestamp', endDate: '$endTime', unit: 'hour' }
            },
            minutesDiff: {
              $dateDiff: { startDate: '$timestamp', endDate: '$endTime', unit: 'minute' }
            },
            secondsDiff: {
              $dateDiff: { startDate: '$timestamp', endDate: '$endTime', unit: 'second' }
            },
            millisecondsDiff: {
              $dateDiff: { startDate: '$timestamp', endDate: '$endTime', unit: 'millisecond' }
            }
          }
        }
      ])

      assert.strictEqual(results[0].yearsDiff, 2)
      assert.strictEqual(results[0].monthsDiff, 29) // 2 years * 12 + 5 months
      assert.ok((results[0].daysDiff as number) > 850) // Roughly 2.4 years
      assert.ok((results[0].hoursDiff as number) > 20000)
      assert.ok((results[0].minutesDiff as number) > 1200000)
      assert.ok((results[0].secondsDiff as number) > 72000000)
      assert.ok((results[0].millisecondsDiff as number) > 72000000000)
    })

    it('should handle invalid unit in $dateDiff', async () => {
      await Event.insertMany([
        {
          name: 'Event1',
          timestamp: new Date('2024-01-01T00:00:00Z'),
          endTime: new Date('2024-01-10T00:00:00Z')
        }
      ])

      const results = await Event.aggregate([
        {
          $project: {
            invalidDiff: {
              $dateDiff: { startDate: '$timestamp', endDate: '$endTime', unit: 'invalid' }
            }
          }
        }
      ])

      assert.strictEqual(results[0].invalidDiff, 0)
    })

    it('should truncate date with $dateTrunc', async () => {
      await Event.insertMany([{ name: 'Event1', timestamp: new Date('2024-06-15T14:25:37.123Z') }])

      const results = await Event.aggregate([
        {
          $project: {
            truncDay: { $dateTrunc: { date: '$timestamp', unit: 'day' } },
            truncHour: { $dateTrunc: { date: '$timestamp', unit: 'hour' } },
            truncMonth: { $dateTrunc: { date: '$timestamp', unit: 'month' } }
          }
        }
      ])

      const truncDay = results[0].truncDay as Date
      assert.strictEqual(truncDay.getUTCHours(), 0)
      assert.strictEqual(truncDay.getUTCMinutes(), 0)
      assert.strictEqual(truncDay.getUTCSeconds(), 0)

      const truncHour = results[0].truncHour as Date
      assert.strictEqual(truncHour.getUTCMinutes(), 0)
      assert.strictEqual(truncHour.getUTCSeconds(), 0)

      const truncMonth = results[0].truncMonth as Date
      assert.strictEqual(truncMonth.getUTCDate(), 1)
    })

    it('should truncate date with all time units', async () => {
      await Event.insertMany([{ name: 'Event1', timestamp: new Date('2024-06-15T14:25:37.123Z') }])

      const results = await Event.aggregate([
        {
          $project: {
            truncYear: { $dateTrunc: { date: '$timestamp', unit: 'year' } },
            truncMonth: { $dateTrunc: { date: '$timestamp', unit: 'month' } },
            truncDay: { $dateTrunc: { date: '$timestamp', unit: 'day' } },
            truncHour: { $dateTrunc: { date: '$timestamp', unit: 'hour' } },
            truncMinute: { $dateTrunc: { date: '$timestamp', unit: 'minute' } },
            truncSecond: { $dateTrunc: { date: '$timestamp', unit: 'second' } }
          }
        }
      ])

      const truncYear = results[0].truncYear as Date
      assert.strictEqual(truncYear.getUTCFullYear(), 2024)
      assert.strictEqual(truncYear.getUTCMonth(), 0) // January
      assert.strictEqual(truncYear.getUTCDate(), 1)
      assert.strictEqual(truncYear.getUTCHours(), 0)
      assert.strictEqual(truncYear.getUTCMinutes(), 0)
      assert.strictEqual(truncYear.getUTCSeconds(), 0)
      assert.strictEqual(truncYear.getUTCMilliseconds(), 0)

      const truncMonth = results[0].truncMonth as Date
      assert.strictEqual(truncMonth.getUTCMonth(), 5) // June (0-indexed)
      assert.strictEqual(truncMonth.getUTCDate(), 1)
      assert.strictEqual(truncMonth.getUTCHours(), 0)

      const truncDay = results[0].truncDay as Date
      assert.strictEqual(truncDay.getUTCDate(), 15)
      assert.strictEqual(truncDay.getUTCHours(), 0)
      assert.strictEqual(truncDay.getUTCMinutes(), 0)

      const truncHour = results[0].truncHour as Date
      assert.strictEqual(truncHour.getUTCHours(), 14)
      assert.strictEqual(truncHour.getUTCMinutes(), 0)
      assert.strictEqual(truncHour.getUTCSeconds(), 0)

      const truncMinute = results[0].truncMinute as Date
      assert.strictEqual(truncMinute.getUTCMinutes(), 25)
      assert.strictEqual(truncMinute.getUTCSeconds(), 0)
      assert.strictEqual(truncMinute.getUTCMilliseconds(), 0)

      const truncSecond = results[0].truncSecond as Date
      assert.strictEqual(truncSecond.getUTCSeconds(), 37)
      assert.strictEqual(truncSecond.getUTCMilliseconds(), 0)
    })
  })

  describe('Date operators in grouping', () => {
    it('should group by year', async () => {
      await Event.insertMany([
        { name: 'Event1', timestamp: new Date('2023-06-15T10:00:00Z') },
        { name: 'Event2', timestamp: new Date('2023-12-25T15:00:00Z') },
        { name: 'Event3', timestamp: new Date('2024-01-10T12:00:00Z') },
        { name: 'Event4', timestamp: new Date('2024-03-20T08:00:00Z') }
      ])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            year: { $year: '$timestamp' }
          }
        },
        {
          $group: {
            _id: '$year',
            count: { $sum: 1 },
            events: { $push: '$name' }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ])

      assert.strictEqual(results.length, 2)
      assert.strictEqual(results[0]._id, 2023)
      assert.strictEqual(results[0].count, 2)
      assert.strictEqual(results[1]._id, 2024)
      assert.strictEqual(results[1].count, 2)
    })

    it('should group by month and year', async () => {
      await Event.insertMany([
        { name: 'Jan1', timestamp: new Date('2024-01-05T10:00:00Z') },
        { name: 'Jan2', timestamp: new Date('2024-01-15T10:00:00Z') },
        { name: 'Feb1', timestamp: new Date('2024-02-10T10:00:00Z') }
      ])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' }
          }
        },
        {
          $group: {
            _id: { year: '$year', month: '$month' },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { '_id.month': 1 }
        }
      ])

      assert.strictEqual(results.length, 2)
      assert.strictEqual((results[0]._id as any).month, 1)
      assert.strictEqual(results[0].count, 2)
      assert.strictEqual((results[1]._id as any).month, 2)
      assert.strictEqual(results[1].count, 1)
    })
  })

  describe('Real-world date scenarios', () => {
    it('should calculate event durations', async () => {
      await Event.insertMany([
        {
          name: 'Meeting',
          timestamp: new Date('2024-06-15T10:00:00Z'),
          endTime: new Date('2024-06-15T11:30:00Z')
        },
        {
          name: 'Conference',
          timestamp: new Date('2024-06-16T09:00:00Z'),
          endTime: new Date('2024-06-16T17:00:00Z')
        }
      ])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            durationHours: {
              $dateDiff: {
                startDate: '$timestamp',
                endDate: '$endTime',
                unit: 'hour'
              }
            }
          }
        }
      ])

      assert.strictEqual(results[0].durationHours, 1) // 1.5 hours floor to 1
      assert.strictEqual(results[1].durationHours, 8)
    })

    it('should format dates for display', async () => {
      await Event.insertMany([{ name: 'Event1', timestamp: new Date('2024-06-15T14:25:00Z') }])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            formatted: {
              $dateToString: {
                date: '$timestamp',
                format: '%Y-%m-%d %H:%M:%S'
              }
            }
          }
        }
      ])

      assert.strictEqual(results[0].formatted, '2024-06-15 14:25:00')
    })

    it('should handle date bucketing by month', async () => {
      await Event.insertMany([
        { name: 'Jan1', timestamp: new Date('2024-01-05T10:00:00Z') },
        { name: 'Jan2', timestamp: new Date('2024-01-15T10:00:00Z') },
        { name: 'Feb1', timestamp: new Date('2024-02-10T10:00:00Z') },
        { name: 'Mar1', timestamp: new Date('2024-03-05T10:00:00Z') }
      ])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            month: { $month: '$timestamp' }
          }
        },
        {
          $bucket: {
            groupBy: '$month',
            boundaries: [1, 3, 6, 13],
            output: {
              count: { $sum: 1 },
              events: { $push: '$name' }
            }
          }
        }
      ])

      assert.strictEqual(results[0]._id, 1) // Jan-Feb bucket
      assert.strictEqual(results[0].count, 3)
      assert.strictEqual(results[1]._id, 3) // Mar-May bucket
      assert.strictEqual(results[1].count, 1)
    })

    it('should handle null date values gracefully', async () => {
      await Event.insertMany([{ name: 'Event1', timestamp: new Date('2024-06-15T10:00:00Z') }])

      const results = await Event.aggregate([
        {
          $project: {
            name: 1,
            endYear: { $year: '$endTime' } // endTime doesn't exist
          }
        }
      ])

      assert.strictEqual(results[0].endYear, null)
    })
  })
})
