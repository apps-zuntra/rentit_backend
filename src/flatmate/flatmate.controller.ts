// flatmate.controller.ts

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';

import { FlatmateService } from './flatmate.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FlatmateDto } from '../flatmate/dto/create-flatmate.dto';
import { uploadToR2 } from '../common/s3.upload';

@Controller('flatmate')
export class FlatmateController {
  constructor(
    private readonly flatmateService: FlatmateService,
  ) { }


  private resolveUserId(req: any): number {
    const user = req.user;

    if (!user) {
      throw new BadRequestException('User not found in request');
    }

    const id = user.id ?? user.userId ?? user.sub;

    if (!id) {
      throw new BadRequestException('Unable to resolve user ID from token');
    }

    return Number(id);
  }

  // =========================================================
  // GET MY LISTINGS — must be declared BEFORE :id to avoid
  // NestJS treating the literal string "my" as a numeric param
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Get('my')
  getMyFlatmates(@Req() req) {
    const userId = this.resolveUserId(req);
    return this.flatmateService.getMyFlatmates(userId);
  }

  // =========================================================
  // CREATE
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() dto: FlatmateDto,
    @Req() req,
  ) {
    const userId = this.resolveUserId(req);
    return this.flatmateService.createFlatmate(dto, userId);
  }

  // =========================================================
  // GET ALL
  // =========================================================
  @Get('all')
  findAll() {
    return this.flatmateService.getAllFlatmates();
  }

  // =========================================================
  // GET ONE
  // =========================================================
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.flatmateService.getFlatmate(id);
  }

  // =========================================================
  // UPDATE — PUT (full replace, kept for backward compat)
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FlatmateDto,
    @Req() req,
  ) {
    const userId = this.resolveUserId(req);
    return this.flatmateService.updateFlatmate(id, dto, userId);
  }

  // =========================================================
  // UPDATE — PATCH (partial update, used by Flutter edit flow)
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FlatmateDto,
    @Req() req,
  ) {
    const userId = this.resolveUserId(req);
    return this.flatmateService.updateFlatmate(id, dto, userId);
  }

  // =========================================================
  // ADDITIONAL DETAILS
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id/additional-details')
  additionalDetails(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FlatmateDto,
    @Req() req,
  ) {
    const userId = this.resolveUserId(req);
    return this.flatmateService.additionalDetails(id, dto, userId);
  }

  // =========================================================
  // UPLOAD IMAGES
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Post(':id/upload-images')
  @UseInterceptors(FilesInterceptor('files'))
  async uploadImages(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('existingImages') existingImages: string,
    @Req() req,
  ) {
    const userId = this.resolveUserId(req);

    const oldImages: string[] = existingImages
      ? JSON.parse(existingImages)
      : [];

    const newUrls: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const url = await uploadToR2(file);
        newUrls.push(url);
      }
    }

    return this.flatmateService.saveImages(id, userId, [
      ...oldImages,
      ...newUrls,
    ]);
  }

  // =========================================================
  // UPLOAD VIDEO
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Post(':id/upload-video')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    }),
  )
  async uploadVideo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req,
  ) {
    if (!file) {
      throw new BadRequestException('No video file uploaded');
    }

    const userId = this.resolveUserId(req);
    const url = await uploadToR2(file);

    return this.flatmateService.saveVideo(id, userId, url);
  }

  // =========================================================
  // SAVE AVAILABILITY
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id/availability')
  saveAvailability(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FlatmateDto,
    @Req() req,
  ) {
    const userId = this.resolveUserId(req);
    return this.flatmateService.saveAvailability(id, userId, dto);
  }

  // =========================================================
  // MARK SOLD OUT — operates on flatmate table via flatmateService
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Put(':id/soldout')
  markSoldOut(
    @Param('id', ParseIntPipe) id: number,
    @Req() req,
    @Body() body: { reason: string },
  ) {
    const userId = this.resolveUserId(req);
    return this.flatmateService.markSoldOut(id, userId, body.reason);
  }

  // =========================================================
  // GET DETAILS + INCREMENT VIEW
  // =========================================================
  @Get(':id/details')
  getFlatmateDetails(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.flatmateService.getFlatmateAndIncrementView(id);
  }

  // =========================================================
  // INCREMENT VIEW COUNT ONLY
  // =========================================================
  @Post(':id/view')
  addView(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.flatmateService.incrementViewCount(id);
  }

  // =========================================================
  // DELETE
  // =========================================================
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  delete(
    @Param('id', ParseIntPipe) id: number,
    @Req() req,
  ) {
    const userId = this.resolveUserId(req);
    return this.flatmateService.deleteFlatmate(id, userId);
  }
}