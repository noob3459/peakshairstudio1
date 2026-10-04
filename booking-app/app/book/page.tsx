import { Suspense } from "react";
import BookingFlow from "./BookingFlow";

export const metadata = {
  title: "Book an Appointment | Peaks Hair Studio",
  description: "Book an appointment at Peaks Hair Studio in Apple Valley, CA.",
};

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookingFlow />
    </Suspense>
  );
}
