"use client";

import { AppLayout } from "@/components/AppLayout";
import { StaffNotificationBoard } from "@/components/StaffNotificationBoard";

export default function StaffNotificationsPage() {
  return (
    <AppLayout role="staff" title="Notificaciones operativas">
      <StaffNotificationBoard />
    </AppLayout>
  );
}
