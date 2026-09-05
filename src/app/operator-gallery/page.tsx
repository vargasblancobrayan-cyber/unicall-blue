import { AppLayout } from "@/components/AppLayout";
import { TrainingGalleryBoard } from "@/components/TrainingGalleryBoard";

export default function OperatorGalleryPage() {
  return (
    <AppLayout role="operator" title="Galeria de gestiones">
      <TrainingGalleryBoard mode="operator" />
    </AppLayout>
  );
}
