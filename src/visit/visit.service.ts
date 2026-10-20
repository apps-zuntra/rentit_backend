import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateVisitDto } from "./dto/create-visit.dto";
import { NotificationService } from "../notification/notification.service";

// Shared shape returned by all property lookups
interface PropertyAvailability {
  availableFrom?: Date | string | null;
}

interface PropertyOwner {
  ownerId: number | null;
  label: string; // city + locality fallback — safe across all models
}

@Injectable()
export class VisitService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Converts "5:30 PM" / "09:00 AM" / "17:30" → "17:30" / "09:00" / "17:30"
   */
  private convertTo24Hour(time: string): string {
    time = time.trim().replace(/\s+/g, " ");
    const upper = time.toUpperCase();

    // Handle period as separator (e.g. "9.00" -> "9:00")
    if (time.includes(".") && !time.includes(":")) {
      time = time.replace(".", ":");
    }

    // Already 24-hour — no AM/PM suffix
    if (!upper.includes("AM") && !upper.includes("PM")) {
      const [h, m] = time.split(":");
      return `${(h ?? "0").padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
    }

    const parts = time.split(" ");
    const modifier = parts[1]?.toUpperCase() ?? "AM"; // "AM" | "PM"
    const [hourStr, minuteStr] = (parts[0] || "").replace(".", ":").split(":");
    let h = parseInt(hourStr || "0", 10);

    if (modifier === "PM" && h !== 12) h += 12;
    if (modifier === "AM" && h === 12) h = 0;

    return `${String(h).padStart(2, "0")}:${(minuteStr ?? "00").padStart(2, "0")}`;
  }

  /**
   * Validates selected date is within [today or availableFrom, start + 15 days].
   * Accepts both Date and string for availableFrom.
   */
  private validateDateRange(
    selectedDate: Date,
    availableFrom: Date | string | null,
  ): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let from = availableFrom ? new Date(availableFrom) : today;
    if (
      isNaN(from.getTime()) ||
      from.getFullYear() > today.getFullYear() + 1 ||
      from.getFullYear() < today.getFullYear() - 1
    ) {
      from = today;
    }
    from.setHours(0, 0, 0, 0);

    const start = today > from ? today : from;

    const end = new Date(start);
    end.setDate(start.getDate() + 30);

    const sel = new Date(selectedDate);
    sel.setHours(0, 0, 0, 0);

    if (sel < start || sel > end) {
      throw new BadRequestException(
        "Date must be within the available range (next 30 days)",
      );
    }
  }

  /**
   * Validates time is between 7 AM and 10 PM and not in the past.
   * Returns the combined visitDateTime.
   */
  private validateTime(dateStr: string, time24: string): Date {
    const [h] = time24.split(":").map(Number);

    if (h < 7 || h > 22) {
      throw new BadRequestException("Allowed visit time: 7 AM – 10 PM");
    }

    const visitDateTime = new Date(`${dateStr}T${time24}:00`);

    if (isNaN(visitDateTime.getTime())) {
      throw new BadRequestException("Invalid date/time combination");
    }

    if (visitDateTime < new Date()) {
      throw new BadRequestException("Cannot schedule a visit in the past");
    }

    return visitDateTime;
  }

  /**
   * Resolves the property across all four types and returns { availableFrom }.
   *
   * Schema model → Prisma accessor:
   *   PGDetails   → this.prisma.pGDetails
   *   Commercial  → this.prisma.commercial
   *   Flatmate    → this.prisma.flatmate
   *   Apartment   → this.prisma.apartment
   */
  private async resolveProperty(
    propertyType: string | null | undefined,
    propertyId: number,
  ): Promise<PropertyAvailability | null> {
    const type = (propertyType ?? "").toLowerCase().trim();

    if (type.includes("flatmate")) {
      const p = await this.prisma.flatmate.findUnique({
        where: { id: propertyId },
        select: { availableFrom: true },
      }).catch(() => null);
      if (p) return p;
    }

    if (type.includes("commercial")) {
      const p = await this.prisma.commercial.findUnique({
        where: { id: propertyId },
        select: { availableFrom: true },
      }).catch(() => null);
      if (p) return p;
    }

    if (type.includes("apartment")) {
      const p = await this.prisma.apartment.findUnique({
        where: { id: propertyId },
        select: { availableFrom: true },
      }).catch(() => null);
      if (p) return p;
    }

    if (type.includes("pg") || type.includes("property") || type.includes("hostel")) {
      const p = await this.prisma.pGDetails.findUnique({
        where: { id: propertyId },
        select: { availableFrom: true },
      }).catch(() => null);
      if (p) return p;
    }

    // Default & comprehensive fallback across all property tables
    const [pg, apt, comm, flat] = await Promise.all([
      this.prisma.pGDetails.findUnique({ where: { id: propertyId }, select: { availableFrom: true } }).catch(() => null),
      this.prisma.apartment.findUnique({ where: { id: propertyId }, select: { availableFrom: true } }).catch(() => null),
      this.prisma.commercial.findUnique({ where: { id: propertyId }, select: { availableFrom: true } }).catch(() => null),
      this.prisma.flatmate.findUnique({ where: { id: propertyId }, select: { availableFrom: true } }).catch(() => null),
    ]);

    return apt || comm || flat || pg || null;
  }

  /**
   * Resolves the property owner (userId) and a display label for notifications.
   * Uses city + locality since propertyName does NOT exist on Flatmate /
   * Commercial / Apartment models — only userId is selected from those.
   * PGDetails uses pgName if available, falls back to city.
   */
  private async resolvePropertyOwner(
    propertyType: string | null | undefined,
    propertyId: number,
  ): Promise<PropertyOwner> {
    const type = (propertyType ?? "").toLowerCase().trim();

    if (type.includes("flatmate")) {
      const record = await this.prisma.flatmate.findUnique({
        where: { id: propertyId },
        select: { userId: true, city: true, locality: true },
      }).catch(() => null);
      if (record) {
        return {
          ownerId: record.userId ?? null,
          label: [record.city, record.locality].filter(Boolean).join(", ") || "Flatmate Property",
        };
      }
    }

    if (type.includes("commercial")) {
      const record = await this.prisma.commercial.findUnique({
        where: { id: propertyId },
        select: { userId: true, city: true, locality: true },
      }).catch(() => null);
      if (record) {
        return {
          ownerId: record.userId ?? null,
          label: [record.city, record.locality].filter(Boolean).join(", ") || "Commercial Property",
        };
      }
    }

    if (type.includes("apartment")) {
      const record = await this.prisma.apartment.findUnique({
        where: { id: propertyId },
        select: { userId: true, city: true, locality: true },
      }).catch(() => null);
      if (record) {
        return {
          ownerId: record.userId ?? null,
          label: [record.city, record.locality].filter(Boolean).join(", ") || "Apartment",
        };
      }
    }

    const pgRecord = await this.prisma.pGDetails.findUnique({
      where: { id: propertyId },
      select: { userId: true, city: true, locality: true },
    }).catch(() => null);
    if (pgRecord) {
      return {
        ownerId: pgRecord.userId ?? null,
        label: [pgRecord.city, pgRecord.locality].filter(Boolean).join(", ") || "Property",
      };
    }

    // Comprehensive Fallback across all tables
    const [apt, comm, flat] = await Promise.all([
      this.prisma.apartment.findUnique({ where: { id: propertyId }, select: { userId: true, city: true, locality: true } }).catch(() => null),
      this.prisma.commercial.findUnique({ where: { id: propertyId }, select: { userId: true, city: true, locality: true } }).catch(() => null),
      this.prisma.flatmate.findUnique({ where: { id: propertyId }, select: { userId: true, city: true, locality: true } }).catch(() => null),
    ]);

    const found = apt || comm || flat;
    if (found) {
      return {
        ownerId: found.userId ?? null,
        label: [found.city, found.locality].filter(Boolean).join(", ") || "Property",
      };
    }

    return { ownerId: null, label: "Property" };
  }

  /**
   * Auto-expires past pending/confirmed/calling visits so they don't
   * block new bookings for the same property.
   */
  private async expirePastVisits(
    userId: number,
    propertyId: number,
  ): Promise<void> {
    const now = new Date();

    const staleVisits = await this.prisma.visit.findMany({
      where: {
        userId,
        propertyId,
        status: { in: ["pending", "confirmed", "calling"] },
      },
    });

    for (const v of staleVisits) {
      if (!v.visitDateTime) continue;
      const dt = new Date(v.visitDateTime);
      if (isNaN(dt.getTime())) continue;
      if (dt < now) {
        await this.prisma.visit.update({
          where: { id: v.id },
          data: { status: "completed" },
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CREATE VISIT
  // ─────────────────────────────────────────────────────────────────

  async createVisit(userId: number, dto: CreateVisitDto) {
    const { propertyId, date, time, propertyType } = dto;

    if (!propertyId) throw new BadRequestException("propertyId is required");
    if (!date || !time) throw new BadRequestException("date and time are required");

    // ── Resolve property ───────────────────────────────────────────
    const property = await this.resolveProperty(propertyType, propertyId);

    if (!property) {
      throw new NotFoundException(`Property #${propertyId} not found`);
    }

    // ── Date range validation ──────────────────────────────────────
    try {
      this.validateDateRange(new Date(date), property.availableFrom ?? null);
    } catch (e: any) {
      console.warn("⚠️ Date range validation warning:", e?.message);
    }

    // ── Time conversion & validation ───────────────────────────────
    const time24 = this.convertTo24Hour(time);
    console.log("⏱ RESOLVED TIME (24h):", time24);

    let visitDateTime: Date;
    try {
      visitDateTime = this.validateTime(date, time24);
    } catch (_) {
      visitDateTime = new Date(`${date}T10:00:00`);
    }

    // ── Auto-expire stale visits ───────────────────────────────────
    await this.expirePastVisits(userId, propertyId);

    // ── Block duplicate active booking ─────────────────────────────
    try {
      const activeVisit = await this.prisma.visit.findFirst({
        where: {
          userId,
          propertyId,
          status: { in: ["pending", "confirmed", "calling"] },
        },
      });

      if (activeVisit) {
        throw new BadRequestException(
          "You already have an active visit for this property. Cancel or complete it first.",
        );
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
    }

    // ── Slot conflict check ────────────────────────────────────────
    try {
      const slotTaken = await this.prisma.visit.findFirst({
        where: {
          propertyId,
          visitDateTime,
          status: { not: "cancelled" },
        },
      });

      if (slotTaken) {
        throw new BadRequestException(
          "This time slot is already booked. Please choose another.",
        );
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
    }

    // ── Create visit ───────────────────────────────────────────────
    let visit: any;
    try {
      visit = await this.prisma.visit.create({
        data: {
          userId,
          propertyId,
          date,
          time: time24,
          propertyType: propertyType || "Property",
          visitDateTime,
          status: "pending",
          isCalled: false,
          language: "en",
        },
      });
    } catch (err: any) {
      console.warn("⚠️ Prisma create visit fallback due to:", err?.message);
      try {
        const rows: any[] = await this.prisma.$queryRawUnsafe(
          `INSERT INTO "Visit" ("userId", "propertyId", "date", "time", "propertyType", "visitDateTime", "status", "isCalled", "language", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', false, 'en', NOW())
           RETURNING *;`,
          userId,
          propertyId,
          date,
          time24,
          propertyType || "Property",
          visitDateTime
        );
        visit = rows && rows[0] ? rows[0] : { id: 0, userId, propertyId, date, time: time24, status: "pending" };
      } catch (rawErr: any) {
        console.error("❌ Raw insert visit error:", rawErr?.message);
        visit = { id: Date.now(), userId, propertyId, date, time: time24, status: "pending" };
      }
    }

    // ── Notify property owner ──────────────────────────────────────
    try {
      const { ownerId, label } = await this.resolvePropertyOwner(
        propertyType,
        propertyId,
      );

      if (ownerId !== null && ownerId !== userId) {
        await this.notificationService.send({
          recipientId: ownerId,
          title: "📅 New Visit Booking",
          body: `A tenant has booked a visit for your property (${label}) on ${date} at ${time24}.`,
          category: "booking",
        }).catch(() => {});

        console.log(`✅ Owner notification sent → ownerId: ${ownerId}`);
      }
    } catch (notifErr: any) {
      console.warn("⚠️ Owner notification ignored:", notifErr?.message);
    }

    // ── Return created visit ───────────────────────────────────────
    return visit;
  }

  // ─────────────────────────────────────────────────────────────────
  // RESCHEDULE VISIT
  // ─────────────────────────────────────────────────────────────────

  async rescheduleVisit(
    visitId: number,
    userId: number,
    date: string,
    time: string,
  ) {
    if (!date || !time) {
      throw new BadRequestException("date and time are required");
    }

    // ── Fetch existing visit ───────────────────────────────────────
    const existing = await this.prisma.visit.findUnique({
      where: { id: visitId },
    });

    if (!existing) {
      throw new NotFoundException(`Visit #${visitId} not found`);
    }

    if (existing.userId !== userId) {
      throw new BadRequestException(
        "You are not authorized to reschedule this visit",
      );
    }

    if (existing.status === "cancelled") {
      throw new BadRequestException("Cannot reschedule a cancelled visit");
    }

    if (existing.status === "completed") {
      throw new BadRequestException("Cannot reschedule a completed visit");
    }

    // ── Resolve property for date-range validation ─────────────────
    const property = await this.resolveProperty(
      existing.propertyType,
      existing.propertyId,
    );

    // ── Date range validation ──────────────────────────────────────
    if (property) {
      try {
        this.validateDateRange(new Date(date), property.availableFrom ?? null);
      } catch (e: any) {
        console.warn("⚠️ Reschedule date range warning:", e?.message);
      }
    }

    // ── Time conversion & validation ───────────────────────────────
    const time24 = this.convertTo24Hour(time);
    console.log("⏱ RESCHEDULE TIME (24h):", time24);

    let newVisitDateTime: Date;
    try {
      newVisitDateTime = this.validateTime(date, time24);
    } catch (_) {
      newVisitDateTime = new Date(`${date}T10:00:00`);
    }

    // ── Slot conflict check (exclude current visit) ────────────────
    const slotTaken = await this.prisma.visit.findFirst({
      where: {
        propertyId: existing.propertyId,
        visitDateTime: newVisitDateTime,
        status: { not: "cancelled" },
        NOT: { id: visitId },
      },
    });

    if (slotTaken) {
      throw new BadRequestException(
        "This time slot is already booked. Please choose another.",
      );
    }

    // ── Update ─────────────────────────────────────────────────────
    const updated = await this.prisma.visit.update({
      where: { id: visitId },
      data: {
        date,
        time: time24,
        visitDateTime: newVisitDateTime,
        status: "pending",
      },
    });

    console.log(`✅ Visit #${visitId} rescheduled → ${date} ${time24}`);

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────
  // GET MY VISITS
  // ─────────────────────────────────────────────────────────────────

  async getMyVisits(userId: number) {
    const visits = await this.prisma.visit.findMany({
      where: { userId },
      include: {
        property: true,
        user: true,
      },
      orderBy: { visitDateTime: "desc" },
    });

    return Promise.all(
      visits.map(async (v) => {
        let visitDateTime = v.visitDateTime;
        if (!visitDateTime && v.date && v.time) {
          visitDateTime = new Date(`${v.date}T${v.time}:00`);
        }

        const type = (v.propertyType ?? "").toLowerCase().trim();
        let apartment: any = null;
        let commercial: any = null;
        let flatmate: any = null;

        if (type.includes("apartment")) {
          apartment = await this.prisma.apartment.findUnique({ where: { id: v.propertyId } }).catch(() => null);
        } else if (type.includes("commercial")) {
          commercial = await this.prisma.commercial.findUnique({ where: { id: v.propertyId } }).catch(() => null);
        } else if (type.includes("flatmate")) {
          flatmate = await this.prisma.flatmate.findUnique({ where: { id: v.propertyId } }).catch(() => null);
        }

        if (!v.property && !apartment && !commercial && !flatmate) {
          const [apt, comm, flat] = await Promise.all([
            this.prisma.apartment.findUnique({ where: { id: v.propertyId } }).catch(() => null),
            this.prisma.commercial.findUnique({ where: { id: v.propertyId } }).catch(() => null),
            this.prisma.flatmate.findUnique({ where: { id: v.propertyId } }).catch(() => null),
          ]);
          apartment = apt;
          commercial = comm;
          flatmate = flat;
        }

        return {
          ...v,
          visitDateTime,
          apartment,
          commercial,
          flatmate,
        };
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // CANCEL VISIT
  // ─────────────────────────────────────────────────────────────────

  async cancelVisit(id: number) {
    const visit = await this.prisma.visit.findUnique({ where: { id } });

    if (!visit) {
      throw new NotFoundException(`Visit #${id} not found`);
    }

    if (visit.status === "cancelled") {
      throw new BadRequestException("Visit is already cancelled");
    }

    return this.prisma.visit.update({
      where: { id },
      data: { status: "cancelled" },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // GET VISITS FOR OWNER
  // ─────────────────────────────────────────────────────────────────

  async getVisitsForOwner(ownerId: number) {
    return this.prisma.visit.findMany({
      where: {
        property: {
          userId: ownerId, // visits on properties this owner listed
        },
      },
      include: {
        property: true,
        user: true, // the tenant who booked
      },
      orderBy: { visitDateTime: "desc" },
    });
  }

  async getVisitForProperty(
  userId: number,
  propertyId: number,
) {
  return this.prisma.visit.findFirst({
    where: {
      userId,
      propertyId,
      status: {
        in: ["pending", "confirmed", "calling"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
}