import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { Queue } from 'bullmq'

/**
 * Schedules the automation cron jobs.
 * See docs/backend-jobs.md for the full schedule table.
 */
@Injectable()
export class AutomationsService implements OnApplicationBootstrap {
  private readonly log = new Logger(AutomationsService.name)
  constructor(@InjectQueue('automations') private q: Queue) {}

  async onApplicationBootstrap() {
    // every 5 minutes: send class reminders + abandoned cart
    await this.q.add('tick-5m', {}, { repeat: { pattern: '*/5 * * * *' }, removeOnComplete: true })
    // daily at 12:00 UTC: renewal alerts + NPS monthly trigger
    await this.q.add('tick-daily', {}, { repeat: { pattern: '0 12 * * *' }, removeOnComplete: true })
    this.log.log('Automation schedules registered')
  }
}
