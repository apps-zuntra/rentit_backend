import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";

import { CommercialService } from "./commercial.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateCommercialDto } from "./dto/create-commercial.dto";
import { UpdateCommercialDto } from "./dto/update-commercial.dto";
import { uploadToR2 } from "../common/s3.upload";

@Controller("commercial")
export class CommercialController {
  constructor(private readonly commercialService: CommercialService) {}

  // ──────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req, @Body() dto: CreateCommercialDto) {
    return this.commercialService.create(req.user.userId, dto);
  }

  // ──────────────────────────────────────────────
  // GET ALL
  // ──────────────────────────────────────────────

  @Get()
  findAll() {
    return this.commercialService.findAll();
  }

  @Get("all")
  findAllAlias() {
    return this.commercialService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get("my")
  getMyCommercial(@Req() req) {
    const userId = req.user.id ?? req.user.userId;
    return this.commercialService.getMyCommercial(userId);
  }

  // ──────────────────────────────────────────────
  // GET ONE
  // ──────────────────────────────────────────────

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.commercialService.findOne(id);
  }

  // ──────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCommercialDto,
  ) {
    return this.commercialService.update(id, dto);
  }

  // ──────────────────────────────────────────────
  // DELETE
  // ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.commercialService.remove(id);
  }

  // ──────────────────────────────────────────────
  // UPLOAD IMAGES
  // ──────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Post(":id/upload-images")
@UseInterceptors(FilesInterceptor("files"))
async uploadImages(
  @Param("id", ParseIntPipe) id: number,
  @UploadedFiles() files: Express.Multer.File[],
  @Body("existingImages") existingImages: string,
  @Req() req,
) {
  const oldImages: string[] = existingImages
    ? JSON.parse(existingImages)
    : [];

  const newUrls = await Promise.all(
    (files || []).map((file) => uploadToR2(file)),
  );

  return this.commercialService.saveImages(
    id, // ✅ property id first
    req.user.userId, // ✅ user id second
    [...oldImages, ...newUrls],
  );
}

  // ──────────────────────────────────────────────
  // UPLOAD VIDEO
  // ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post(":id/upload-video")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  async uploadVideo(
    @Param("id", ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req,
  ) {
    if (!file) throw new BadRequestException("No video file provided");

    const url = await uploadToR2(file);

    return this.commercialService.saveVideo(id, req.user.userId, url);
  }

  // ──────────────────────────────────────────────
  // SAVE CONTACT
  // ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Put(":id/contact")
  saveContact(
    @Param("id", ParseIntPipe) id: number,
    @Req() req,
    @Body() dto: UpdateCommercialDto,
  ) {
    return this.commercialService.saveContact(id, req.user.userId, dto);
  }

  // ──────────────────────────────────────────────
  // SAVE AVAILABILITY
  // ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Put(":id/availability")
  saveAvailability(
    @Param("id", ParseIntPipe) id: number,
    @Req() req,
    @Body() dto: UpdateCommercialDto,
  ) {
    return this.commercialService.saveAvailability(id, req.user.userId, dto);
  }

  // Increment views count
@Post(":id/view")
incrementViews(@Param("id", ParseIntPipe) id: number) {
  return this.commercialService.incrementViews(id);
}

@UseGuards(JwtAuthGuard)
@Put(':id/soldout')
markSoldOut(
  @Param('id', ParseIntPipe) id: number,
  @Req() req,
  @Body() body: { reason: string },
) {
  return this.commercialService.markSoldOut(
    id,
    req.user.userId,
    body.reason,
  );
}
}