// payment.controller.ts

import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { RazorpayService } from './razorpay.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('payment')
export class PaymentController {
  constructor(private readonly razorpayService: RazorpayService) {}

  @Post('create-order')
  createOrder(@Body('amount') amount: number) {
    return this.razorpayService.createOrder(amount);
  }

  
@UseGuards(JwtAuthGuard)

@Post('verify')
verifyPayment(@Body() body: any, @Req() req: any) {
  return this.razorpayService.verifyPayment(body, req);
}
}