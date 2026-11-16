import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { PromotionsService } from './promotions.service'

/**
 * Todos los campos son opcionales a propósito: sirve para crear y para editar
 * parcialmente. Las reglas de negocio se validan en el servicio sobre el
 * resultado completo.
 */
class PromoDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string
  @IsOptional() @IsBoolean() isActive?: boolean
  @IsOptional() @Type(() => Number) @IsInt() @Min(-1000) @Max(1000) priority?: number
  @IsOptional() @IsDateString() startsAt?: string | null
  @IsOptional() @IsDateString() endsAt?: string | null
  @IsOptional() @IsIn(['PERCENT', 'USD', 'COP']) discountType?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100_000_000) discountValue?: number
  @IsOptional() @IsArray() @IsString({ each: true }) planIds?: string[]
  @IsOptional() @IsBoolean() appliesToNew?: boolean
  @IsOptional() @IsBoolean() appliesToRenewals?: boolean
  @IsOptional() @IsIn(['ALL', 'LINK']) audience?: string
  @IsOptional() @IsString() @MaxLength(40) code?: string | null
  @IsOptional() @IsString() @MaxLength(100) utmSource?: string | null
  @IsOptional() @IsString() @MaxLength(100) utmMedium?: string | null
  @IsOptional() @IsString() @MaxLength(100) utmCampaign?: string | null
  @IsOptional() @IsBoolean() showBanner?: boolean
  @IsOptional() @IsBoolean() showOnPrices?: boolean
  @IsOptional() @IsString() @MaxLength(200) bannerText?: string | null
  @IsOptional() @IsString() @MaxLength(40) badgeText?: string | null
  @IsOptional() @IsString() @MaxLength(60) checkoutLabel?: string | null
  @IsOptional() @IsString() @MaxLength(7) bgColor?: string
  @IsOptional() @IsString() @MaxLength(7) textColor?: string
  @IsOptional() @IsBoolean() showCountdown?: boolean
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) maxRedemptions?: number | null
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/promotions')
export class AdminPromotionsController {
  constructor(private svc: PromotionsService) {}

  /** @endpoint GET /api/v1/admin/promotions — con usos y estado calculado. */
  @Get()
  list() { return this.svc.listar() }

  /** @endpoint POST /api/v1/admin/promotions */
  @Post()
  create(@Body() dto: PromoDto) { return this.svc.crear(dto) }

  /** @endpoint PATCH /api/v1/admin/promotions/:id */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: PromoDto) { return this.svc.actualizar(id, dto) }

  /** @endpoint DELETE /api/v1/admin/promotions/:id */
  @Delete(':id')
  remove(@Param('id') id: string) { return this.svc.borrar(id) }
}

@ApiTags('public')
@Controller('public/promotions')
export class PublicPromotionsController {
  constructor(private svc: PromotionsService) {}

  /**
   * @endpoint GET /api/v1/public/promotions?promo=&utm_source=&utm_medium=&utm_campaign=
   * Promos vigentes que le corresponden a quien llegó con ese enlace. Solo
   * campos públicos.
   */
  @Get()
  publicas(
    @Query('promo') promo?: string,
    @Query('utm_source') utm_source?: string,
    @Query('utm_medium') utm_medium?: string,
    @Query('utm_campaign') utm_campaign?: string,
  ) {
    const corto = (s?: string) => (typeof s === 'string' ? s.slice(0, 100) : undefined)
    return this.svc.publicas({
      promo: corto(promo),
      utm_source: corto(utm_source),
      utm_medium: corto(utm_medium),
      utm_campaign: corto(utm_campaign),
    })
  }
}
