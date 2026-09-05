import { AppLayout } from "@/components/AppLayout";
import { TrainingGalleryBoard } from "@/components/TrainingGalleryBoard";

export default function StaffGalleryPage() {
  return (
    <AppLayout role="staff" title="Galeria de gestiones">
      <TrainingGalleryBoard mode="staff" />
    </AppLayout>
  );
}
