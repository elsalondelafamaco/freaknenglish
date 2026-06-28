import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString } from 'class-validator'
import { CheckoutService } from './checkout.service'

class CreateIntentDto {
  @IsString() planId!: string
  @IsEmail() customerEmail!: string
  @IsString() customerName!: string
  @IsString() customerPhone!: string
  @IsString() customerDocument!: string
  @IsString() @IsOptional() userId?: string
}

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private svc: CheckoutService) {}
  /** @endpoint POST /api/v1/checkout/intents */
  @Post('intents')
  create(@Body() dto: CreateIntentDto) { return this.svc.createIntent(dto) }
}
