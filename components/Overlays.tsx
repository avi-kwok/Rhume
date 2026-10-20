"use client";

import BriefDrawer from "./BriefDrawer";
import { EvidenceTooltipLayer } from "./Evidence";
import PresenterController from "./PresenterController";
import RejectDialog from "./RejectDialog";
import SapOrderModal from "./SapOrderModal";

/** App-wide layers: the brief drawer, the SAP order modal, the reject dialog, hotkeys and tooltips. */
export default function Overlays() {
  return (
    <>
      <PresenterController />
      <BriefDrawer />
      <SapOrderModal />
      <RejectDialog />
      <EvidenceTooltipLayer />
    </>
  );
}
