import type { Meta } from "@storybook/react-vite";
import { StrictMode } from "react";
import { withScenario } from "../src/storybook.js";
import { Billing } from "./Billing.js";
import { billingScenario } from "./fixtures.js";
import { getInvoices } from "./generated/client.js";
import { attachBilling, type BillingMode } from "./network.js";

const meta: Meta<typeof Billing> = { title: "Billing", component: Billing };
export default meta;

function story(mode: BillingMode) {
  const scenario = billingScenario(
    `billing-${mode}`,
    mode === "loading" ? ["loading"] : mode === "paid" ? ["loaded", "paid"] : ["loaded"],
  );
  const scenarioStory = withScenario(scenario, {
    sourceRevision: "synthetic-example-v1",
    setup: (execution) => attachBilling(execution, execution.fixtures, mode),
    async play({ canvasElement }, execution) {
      if (mode === "loading") {
        await execution.checkpoint(
          "loading",
          () => canvasElement.textContent?.includes("Loading invoices") === true,
        );
        return;
      }
      if (mode === "paid") {
        await execution.checkpoint("loaded", () => canvasElement.querySelector("button") !== null);
        canvasElement.querySelector("button")?.click();
        await execution.checkpoint(
          "paid",
          () => canvasElement.textContent?.includes("— paid") === true,
        );
        const reread = await getInvoices({ signal: execution.signal });
        if (reread[0]?.status !== "paid") {
          throw new Error("Payment was not reflected in the next invoice read");
        }
        return;
      }
      await execution.checkpoint("loaded", () => {
        if (mode === "empty")
          return canvasElement.textContent?.includes("No invoices yet.") === true;
        if (mode === "error" || mode === "unexpected" || mode === "invalid")
          return canvasElement.textContent?.includes("Unable to load invoices.") === true;
        return canvasElement.textContent?.includes("invoice-101") === true;
      });
    },
  });
  return {
    ...scenarioStory.annotations,
    render: () => {
      return (
        <StrictMode>
          <Billing />
        </StrictMode>
      );
    },
  };
}

export const Success = story("success");
export const Empty = story("empty");
export const ExpectedError = story("error");
export const Loading = story("loading");
export const Paid = story("paid");
export const UnexpectedRequest = story("unexpected");

// Deliberately broken mock: validates failure diagnostics, not a ready review state.
export const InvalidResponse = story("invalid");
