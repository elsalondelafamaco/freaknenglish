import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common'
import PDFDocument from 'pdfkit'
import { PrismaService } from '../../prisma/prisma.service'
import { env } from '../../config/env'

/**
 * D8 · Genera recibos PDF de pagos aprobados con branding tomado del env
 * (BRAND_*, PUBLIC_SITE_URL, BRAND_SUPPORT_EMAIL).
 *
 * NOTA: no es factura fiscal (DIAN). Es un recibo interno del monto
 * cobrado por Wompi con la referencia y datos del cliente.
 */
@Injectable()
export class ReceiptsService {
  constructor(private prisma: PrismaService) {}

  async pdfBufferForOwner(intentId: string, userId: string, userEmail: string) {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: intentId },
      include: { plan: true },
    })
    if (!intent) throw new NotFoundException('Payment not found')
    if (intent.userId && intent.userId !== userId) {
      if (intent.customerEmail.toLowerCase() !== userEmail.toLowerCase()) {
        throw new ForbiddenException()
      }
    }
    if (intent.status !== 'APPROVED') {
      throw new BadRequestException('Receipt only available for approved payments')
    }

    return await new Promise<Buffer>((resolve) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 })
      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))

      const brand = env.BRAND_NAME
      const ink = env.BRAND_INK || '#0A0A0A'
      const accent = env.BRAND_ACCENT || '#0A0A0A'

      // Header
      doc.fillColor(ink).fontSize(22).text(brand, { continued: false })
      doc.moveDown(0.2)
      doc.fillColor('#666').fontSize(10).text(env.BRAND_TAGLINE)
      doc.moveDown(0.5)
      doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#eee').stroke()
      doc.moveDown(1)

      // Título recibo
      doc.fillColor(ink).fontSize(18).text('Recibo de pago')
      doc.fontSize(10).fillColor('#666')
        .text(`Referencia: ${intent.reference}`)
        .text(`Wompi ID: ${intent.wompiId ?? '—'}`)
        .text(`Fecha: ${(intent.approvedAt ?? intent.createdAt).toLocaleString('es-CO')}`)

      doc.moveDown(1)

      // Cliente
      doc.fontSize(12).fillColor(ink).text('Cliente', { underline: false })
      doc.fontSize(10).fillColor('#333')
        .text(intent.customerName)
        .text(intent.customerEmail)
        .text(intent.customerPhone ?? '')
        .text(intent.customerDocument ? `Documento: ${intent.customerDocument}` : '')

      doc.moveDown(1)

      // Tabla monto
      doc.fontSize(12).fillColor(ink).text('Detalle')
      doc.moveDown(0.3)
      const y = doc.y
      doc.rect(48, y, 500, 60).fillColor('#F7F7F7').fill()
      doc.fillColor(ink).fontSize(11).text(`Plan: ${intent.plan?.name ?? intent.planId}`, 60, y + 12)
      const amount = new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: intent.currency, maximumFractionDigits: 0,
      }).format(intent.amountInCents / 100)
      doc.fontSize(14).fillColor(accent).text(`Total pagado: ${amount}`, 60, y + 34)
      doc.moveDown(4)

      // Footer
      doc.fontSize(9).fillColor('#888')
        .text('Este recibo es un comprobante interno del cobro procesado por Wompi.')
        .text('No constituye factura fiscal electrónica (DIAN).')
      if (env.BRAND_SUPPORT_EMAIL) {
        doc.moveDown(0.3).text(`¿Dudas? Escríbenos a ${env.BRAND_SUPPORT_EMAIL}`)
      }
      doc.moveDown(0.3).text(env.PUBLIC_SITE_URL)

      doc.end()
    })
  }
}