import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/nexus")

SOPS = [
    {
        "type": "late_delivery",
        "sopId": "DHL-OPS-01",
        "title": "Late delivery handling",
        "steps": [
            "Check tracking system for last scan location and timestamp",
            "Contact responsible depot via depot hotline within 30 minutes",
            "Provide customer with updated ETA within 2 hours of complaint",
            "Escalate to Operations Manager if delay exceeds 48 hours",
            "Log incident with full tracking history attached"
        ],
        "keywords": ["late", "delay", "not arrived", "stuck", "where", "overdue"]
    },
    {
        "type": "damaged_parcel",
        "sopId": "DHL-OPS-02",
        "title": "Damaged parcel handling",
        "steps": [
            "Request photographic evidence from customer immediately",
            "Complete damage report form DHL-DR-01 with all details",
            "Initiate insurance claim if declared value exceeds RM 500",
            "Arrange priority replacement shipment if applicable",
            "Notify sender and recipient of resolution timeline"
        ],
        "keywords": ["damaged", "broken", "crushed", "wet", "dented", "shattered", "rosak"]
    },
    {
        "type": "address_error",
        "sopId": "DHL-OPS-03",
        "title": "Address correction process",
        "steps": [
            "Verify correct address with both sender and recipient",
            "Update delivery address in DHL tracking system",
            "Redirect parcel at nearest hub if still in transit",
            "Confirm redelivery schedule with recipient in writing",
            "Document address correction in incident log"
        ],
        "keywords": ["wrong address", "incorrect", "spelling", "driver lost", "salah tempat", "cant find"]
    },
    {
        "type": "system_error",
        "sopId": "DHL-OPS-04",
        "title": "System error escalation",
        "steps": [
            "Document exact error message, timestamp, and affected system",
            "Check DHL system status dashboard for known outages",
            "Escalate to IT helpdesk within 30 minutes if unresolved",
            "Log priority ticket with IT: system name, error, user impact",
            "Update customer on expected resolution time every 2 hours"
        ],
        "keywords": ["500", "error", "crash", "bug", "timestamp", "loading", "system problem"]
    },
    {
        "type": "missing_parcel",
        "sopId": "DHL-OPS-05",
        "title": "Missing parcel investigation",
        "steps": [
            "Confirm the last scan event, depot, and timestamp within 30 minutes",
            "Trigger trace search with the responsible depot and linehaul team",
            "Validate proof of delivery, CCTV, and handover records if marked delivered",
            "Escalate high-value or critical shipments to Operations Manager immediately",
            "Update the customer with recovery status or replacement path within 24 hours"
        ],
        "keywords": ["missing", "lost", "not received", "never arrived", "stolen", "hilang"]
    },
    {
        "type": "wrong_item",
        "sopId": "DHL-OPS-06",
        "title": "Wrong item return and correction",
        "steps": [
            "Request photographic evidence of received item",
            "Arrange free return label — customer not to bear cost",
            "Coordinate correct item dispatch with sender urgently",
            "Confirm both collection and correct delivery dates with customer",
            "Monitor both shipments until completion"
        ],
        "keywords": ["wrong item", "swapped", "not my", "mismatch", "salah barang", "somebody else"]
    },
    {
        "type": "other",
        "sopId": "DHL-OPS-07",
        "title": "General incident triage",
        "steps": [
            "Gather complete incident details: who, what, when, where",
            "Categorise into nearest matching incident type",
            "Assign to appropriate team with full context notes",
            "Set priority based on customer impact assessment",
            "Confirm receipt and response timeline with reporter"
        ],
        "keywords": ["general", "enquiry", "quotation", "business account", "drop off"]
    }
]

def format_db_name(uri):
    return uri.rstrip('/').split('/')[-1].split('?')[0] or "nexus"

def seed_sops():
    client = MongoClient(MONGODB_URI)
    db_name = format_db_name(MONGODB_URI)
    db = client[db_name]

    collection = db.sop_library
    
    count = collection.count_documents({})
    if count > 0:
        print("SOPs already exist, skipping.")
        return

    collection.insert_many(SOPS)
    print(f"Seeded {len(SOPS)} SOPs.")

if __name__ == "__main__":
    seed_sops()
