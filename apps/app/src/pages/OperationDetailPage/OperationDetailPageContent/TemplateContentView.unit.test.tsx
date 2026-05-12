import { render } from "@/test/test-wrapper";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OperationDetailPageStoreProvider } from "../_store";
import { TemplateContentView } from "./TemplateContentView";

vi.mock("@/integrations/refine/dataProvider", () => ({
  dataProvider: { getOne: vi.fn() },
  ResourceName: {
    operationOutputItemTemplates: "operationOutputItemTemplates",
  },
}));

vi.mock("@/router", () => ({
  router: { navigate: vi.fn() },
}));

const renderWithStore = (ui: React.ReactElement) =>
  render(ui, { wrapper: OperationDetailPageStoreProvider });

describe("TemplateContentView", () => {
  it("previews HTML in a strict sandbox", async () => {
    renderWithStore(
      <TemplateContentView
        template={{
          id: "tpl-html",
          name: "HTML template",
          description: null,
          content: "<script>window.top.location='https://example.com'</script>",
          contentType: "html",
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /preview/i }));

    const frame = screen.getByTitle("HTML template");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  });
});
