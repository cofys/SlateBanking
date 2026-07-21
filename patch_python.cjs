const fs = require('fs');

let nodeCode = fs.readFileSync('Bank-main/cogs/node_api.py', 'utf8');

const rNodeSecret = `self.node_secret = cfg.get("node_secret", "secret")`;
const sNodeSecret = `self.node_secret = cfg.get("node_secret")
        if not self.node_secret or self.node_secret == "secret":
            print("CRITICAL: node_secret is missing or uses default!")
            import sys
            sys.exit(1)`;
nodeCode = nodeCode.replace(rNodeSecret, sNodeSecret);

const rVerifyHub = `        def verify_hub(x_node_secret: str = Header(...)):
            if x_node_secret != self.node_secret:
                raise HTTPException(401, "Unauthorized Hub Access")`;
const sVerifyHub = `        def verify_hub(x_node_secret: str = Header(...)):
            import hmac
            if not hmac.compare_digest(x_node_secret, self.node_secret):
                raise HTTPException(401, "Unauthorized Hub Access")`;
nodeCode = nodeCode.replace(rVerifyHub, sVerifyHub);

fs.writeFileSync('Bank-main/cogs/node_api.py', nodeCode);
console.log("node_api.py patched");

let bankCode = fs.readFileSync('Bank-main/cogs/bank_cog.py', 'utf8');
const rVerifyPin = `    async def _verify_pin(self, ctx: discord.ApplicationContext, account, pin: str) -> bool:
        if not account.pin:
            return True
            
        import bcrypt
        if not account.pin.startswith('$2b$'):
            return account.pin == pin
            
        # Ensure it's executed in thread to not block event loop
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, bcrypt.checkpw, pin.encode('utf-8'), account.pin.encode('utf-8'))`;

const sVerifyPin = `    # Attempt tracker
    _failed_pins = {}

    async def _verify_pin(self, ctx: discord.ApplicationContext, account, pin: str) -> bool:
        if not account.pin:
            return True

        # Check lock
        import time
        key = f"{account.discord_id}_{account.account_name}"
        attempts, lock_until = self._failed_pins.get(key, (0, 0))
        if time.time() < lock_until:
            await ctx.respond("Account is temporarily locked due to too many failed PIN attempts. Try again later.", ephemeral=True)
            return False

        import bcrypt
        import asyncio
        loop = asyncio.get_event_loop()
        
        is_valid = False
        if not account.pin.startswith('$2b$'):
            is_valid = (account.pin == pin)
        else:
            is_valid = await loop.run_in_executor(None, bcrypt.checkpw, pin.encode('utf-8'), account.pin.encode('utf-8'))
        
        if is_valid:
            self._failed_pins[key] = (0, 0)
            return True
        else:
            attempts += 1
            if attempts >= 5:
                self._failed_pins[key] = (attempts, time.time() + 300) # 5 minutes
            else:
                self._failed_pins[key] = (attempts, 0)
            return False`;

bankCode = bankCode.replace(rVerifyPin, sVerifyPin);
fs.writeFileSync('Bank-main/cogs/bank_cog.py', bankCode);
console.log("bank_cog.py patched");

