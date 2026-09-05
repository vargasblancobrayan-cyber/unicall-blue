"use client";

import { AppLayout } from "@/components/AppLayout";
import { StaffNotificationBoard } from "@/components/StaffNotificationBoard";

export default function StaffNotificationHistoryPage() {
  return (
    <AppLayout role="staff" title="Historial de notificaciones">
      <StaffNotificationBoard historyOnly />
    </AppLayout>
  );
}
