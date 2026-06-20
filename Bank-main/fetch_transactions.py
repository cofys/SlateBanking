import requests
import base64
import yaml
import sys

# Load configuration from config.yaml (excluding corp_id)
try:
    with open("config.yaml", "r") as f:
        cfg = yaml.safe_load(f)
except FileNotFoundError:
    print("Error: config.yaml not found. Please ensure it exists in the current directory.")
    sys.exit(1)
except yaml.YAMLError as e:
    print(f"Error parsing config.yaml: {e}")
    sys.exit(1)

# Extract required configuration values (excluding corp_id)
try:
    API_URL = cfg["api"]["base_url"].replace("cityrp.net", "cityrp.org")
    API_KEY = cfg["api"]["api_key"].strip()
    CITYRP_UUID = cfg["api"]["cityrp_uuid"]
except KeyError as e:
    print(f"Missing configuration key: {e}")
    sys.exit(1)

# Construct authentication header
auth_string = f"{CITYRP_UUID}:{API_KEY}"
auth_encoded = base64.b64encode(auth_string.encode()).decode()
HEADERS = {
    "Authorization": f"Basic {auth_encoded}",
    "User-Agent": "GalabankBot/1.0"
}

def fetch_transactions(corp_id, account_name, page=1):
    """
    Fetches transactions for the specified corp_id, account_name, and page.
    """
    endpoint = f"{API_URL}/corp/accounts/transactions/list"
    params = {"corp_id": corp_id, "account_name": account_name.lower(), "page": page}
    try:
        resp = requests.get(endpoint, params=params, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            print("Full API Response:")
            try:
                print(resp.json())
            except ValueError:
                print(f"Response is not JSON: {resp.text}")
        else:
            print(f"API Error: {resp.status_code} - {resp.text}")
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    # Check for correct number of arguments
    if len(sys.argv) < 3 or len(sys.argv) > 4:
        print("Usage: python fetch_transactions.py <corp_id> <account_name> [page]")
        sys.exit(1)
    
    # Parse command-line arguments
    corp_id = sys.argv[1]
    account_name = sys.argv[2]
    
    # Handle optional page argument
    if len(sys.argv) == 4:
        try:
            page = int(sys.argv[3])
        except ValueError:
            print("Error: page must be an integer")
            sys.exit(1)
    else:
        page = 1
    
    # Fetch and display transactions
    fetch_transactions(corp_id, account_name, page)