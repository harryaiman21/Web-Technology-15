import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEMO_ARTICLES = [
  {
    title: "Parcel Sorting Procedure at Central Hub",
    summary:
      "Standard operating procedure for sorting incoming parcels at DHL central sorting facilities. Covers scanning, zone classification, and loading protocols.",
    steps: [
      "Receive incoming parcels from unloading dock",
      "Scan each parcel barcode using handheld scanner",
      "System assigns destination zone automatically",
      "Place parcel on correct conveyor belt for zone",
      "Verify belt assignment matches label zone code",
      "Flag oversized parcels for manual processing",
      "Log batch completion in warehouse management system",
    ],
    tags: ["sorting", "warehouse", "scanning", "parcel", "hub"],
    status: "published",
  },
  {
    title: "Customs Documentation for International Shipments",
    summary:
      "Guide for preparing and verifying customs documentation for cross-border DHL Express shipments. Includes required forms and common rejection reasons.",
    steps: [
      "Verify shipper has completed commercial invoice",
      "Check HS code classification against product description",
      "Ensure declared value matches invoice total",
      "Attach certificate of origin if required by destination",
      "Submit electronic customs declaration via system",
      "Monitor for customs hold notifications",
      "Resolve any discrepancy flags within 24 hours",
    ],
    tags: ["customs", "shipping", "international", "freight", "documentation"],
    status: "reviewed",
  },
  {
    title: "Damaged Parcel Handling Protocol",
    summary:
      "Steps for handling parcels that arrive damaged at any DHL facility. Includes photo documentation, reporting, and customer notification procedures.",
    steps: [
      "Isolate damaged parcel from regular flow",
      "Photograph damage from three angles minimum",
      "Scan barcode and open damage report in system",
      "Classify damage severity: minor, moderate, severe",
      "Notify shift supervisor for severe damage cases",
      "Update tracking status to Under Review",
      "Contact sender within 48 hours for insured shipments",
      "Store parcel in secure inspection area",
    ],
    tags: ["handling", "damage", "warehouse", "return", "inspection"],
    status: "draft",
  },
  {
    title: "Vehicle Loading Optimization Guide",
    summary:
      "Best practices for loading delivery vehicles to maximize capacity utilization and ensure safe transport of parcels during last-mile delivery.",
    steps: [
      "Review route manifest and total parcel count",
      "Sort parcels by delivery sequence (last stop loaded first)",
      "Place heavy parcels on floor level",
      "Stack lighter parcels on top, max 3 layers",
      "Secure fragile items with padding material",
      "Fill gaps with soft parcels to prevent shifting",
      "Verify total weight does not exceed vehicle limit",
      "Close and secure vehicle doors",
    ],
    tags: ["delivery", "transport", "loading", "route", "logistics"],
    status: "draft",
  },
  {
    title: "Returns Processing Workflow",
    summary:
      "End-to-end process for handling returned shipments including receiving, inspection, restocking decisions, and customer refund triggers.",
    steps: [
      "Scan return label at receiving dock",
      "Match return to original shipment record",
      "Inspect item condition against return reason",
      "Classify: restock, refurbish, or dispose",
      "Update inventory management system",
      "Trigger customer refund notification",
      "Log return metrics for quality reporting",
    ],
    tags: ["return", "warehouse", "inventory", "customer", "logistics"],
    status: "reviewed",
  },
];

export async function POST() {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Seed route is disabled in production" },
        { status: 403 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const created: string[] = [];

    for (const demo of DEMO_ARTICLES) {
      const { data: article, error: artErr } = await supabase
        .from("knowledge_articles")
        .insert({
          title: demo.title,
          summary: demo.summary,
          status: demo.status,
          creator_id: user.id,
          current_version_number: 1,
          duplicate_flag: false,
          conflict_flag: false,
        })
        .select()
        .single();

      if (artErr || !article) continue;

      await supabase.from("article_steps").insert(
        demo.steps.map((text, i) => ({
          article_id: article.id,
          step_number: i + 1,
          step_text: text,
        })),
      );

      await supabase.from("article_tags").insert(
        demo.tags.map((tag) => ({
          article_id: article.id,
          tag_name: tag,
        })),
      );

      await supabase.from("article_versions").insert({
        article_id: article.id,
        version_number: 1,
        title: demo.title,
        summary: demo.summary,
        status_at_that_time: demo.status,
        edited_by: user.id,
        change_note: "Demo seed data",
        snapshot_json: {
          title: demo.title,
          summary: demo.summary,
          steps: demo.steps,
          tags: demo.tags,
        },
      });

      await supabase.from("status_history").insert({
        article_id: article.id,
        old_status: null,
        new_status: demo.status,
        changed_by: user.id,
        note: "Demo seed",
      });

      created.push(demo.title);
    }

    return NextResponse.json({ success: true, created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
