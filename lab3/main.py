from pymongo import MongoClient
from bson.objectid import ObjectId

# MongoDB connection
try:
    client = MongoClient('mongodb://localhost:27017/')
    db = client['mydatabase']
    items = db['items']
    # Test connection
    client.server_info()  # Raises an error if connection fails
except Exception as e:
    print(f"Error connecting to MongoDB: {e}")
    exit(1)


# Utility to convert MongoDB item to a readable format
def item_to_dict(item):
    item['id'] = str(item['_id'])
    del item['_id']
    return item


# CREATE: Add a new item
def create_item(name, description=""):
    if not name:
        return {"error": "Name is required"}
    try:
        item = {"name": name, "description": description}
        result = items.insert_one(item)
        new_item = items.find_one({"_id": result.inserted_id})
        return item_to_dict(new_item)
    except Exception as e:
        return {"error": f"Failed to create item: {str(e)}"}


# READ ALL: Get all items
def get_all_items():
    try:
        all_items = list(items.find())
        return [item_to_dict(item) for item in all_items]
    except Exception as e:
        return {"error": f"Failed to fetch items: {str(e)}"}


# READ ONE: Get a single item by ID
def get_item(item_id):
    try:
        item = items.find_one({"_id": ObjectId(item_id)})
        if not item:
            return {"error": "Item not found"}
        return item_to_dict(item)
    except Exception as e:
        return {"error": f"Invalid ID or error: {str(e)}"}


# UPDATE: Update an item by ID
def update_item(item_id, name=None, description=None):
    try:
        update_data = {}
        if name:
            update_data["name"] = name
        if description is not None:
            update_data["description"] = description
        if not update_data:
            return {"error": "No update data provided"}
        result = items.update_one(
            {"_id": ObjectId(item_id)},
            {"$set": update_data}
        )
        if result.matched_count == 0:
            return {"error": "Item not found"}
        updated_item = items.find_one({"_id": ObjectId(item_id)})
        return item_to_dict(updated_item)
    except Exception as e:
        return {"error": f"Invalid ID or error: {str(e)}"}


# DELETE: Delete an item by ID
def delete_item(item_id):
    try:
        result = items.delete_one({"_id": ObjectId(item_id)})
        if result.deleted_count == 0:
            return {"error": "Item not found"}
        return {"message": "Item deleted"}
    except Exception as e:
        return {"error": f"Invalid ID or error: {str(e)}"}


# Example usage
if __name__ == "__main__":
    print("Creating items:")
    item1 = create_item("Book", "A novel")
    print(item1)

    if "error" not in item1:
        item_id = item1["id"]
        print(create_item("Pen", "A blue pen"))

        print("\nAll items:")
        print(get_all_items())

        print("\nGet one item:")
        print(get_item(item_id))

        print("\nUpdating item:")
        print(update_item(item_id, name="Updated Book", description="A thriller"))

        print("\nDeleting item:")
        print(delete_item(item_id))
    else:
        print("Skipping further operations due to creation failure.")