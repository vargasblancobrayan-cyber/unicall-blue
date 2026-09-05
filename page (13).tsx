"use client";

import { NotificationCenter } from "@/components/NotificationCenter";
import { AppLayout } from "@/components/AppLayout";

export default function OperatorNotificationsPage() {
  return (
    <AppLayout role="operator" title="Notificaciones">
      <NotificationCenter role="operator" full />
    </AppLayout>
  );
}
