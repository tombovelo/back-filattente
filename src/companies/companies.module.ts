import { Module } from '@nestjs/common';
import { forwardRef } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

@Module({
  imports: [forwardRef(() => TicketsModule)],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}