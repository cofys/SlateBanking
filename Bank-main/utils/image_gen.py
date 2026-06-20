from PIL import Image, ImageDraw, ImageFont
import io
import os
import logging
import random

logger = logging.getLogger('image_gen')

class CardGenerator:
    def __init__(self):
        self.base_path = "assets/card_bg.png"
        self.font_path = "assets/font.ttf"
        
        # Check if assets exist
        if not os.path.exists(self.base_path):
            logger.warning("assets/card_bg.png not found. Card generation will fail.")

    def draw_text_with_shadow(self, draw, xy, text, font, fill_color, shadow_color=(0, 0, 0, 180), offset=(1, 1)):
        """Helper to draw text with a drop shadow (Scaled down for 199x126)."""
        x, y = xy
        # Draw Shadow
        draw.text((x + offset[0], y + offset[1]), text, font=font, fill=shadow_color)
        # Draw Main Text
        draw.text((x, y), text, font=font, fill=fill_color)
        
    def generate_card(self, account_name: str, account_type: str, balance: float, holder_name: str = "Valued Client") -> io.BytesIO:
        """Generates a premium-looking debit card image, scaled for 199x126px."""
        try:
            # 1. Load Image
            if not os.path.exists(self.base_path):
                return None
                
            img = Image.open(self.base_path).convert("RGBA")
            draw = ImageDraw.Draw(img)
            width, height = img.size # Should be 199, 126
            
            # 2. Load Fonts (Scaled down for small resolution)
            try:
                # Sizes calibrated for 126px height
                font_xl = ImageFont.truetype(self.font_path, 15)  # Balance
                font_large = ImageFont.truetype(self.font_path, 13) # Account Name
                font_medium = ImageFont.truetype(self.font_path, 10) # Name
                font_small = ImageFont.truetype(self.font_path, 7)   # Labels / Dates
            except:
                font_xl = ImageFont.load_default()
                font_large = ImageFont.load_default()
                font_medium = ImageFont.load_default()
                font_small = ImageFont.load_default()

            # --- DESIGN ELEMENTS ---

            # A. Account Name (Centered)
            # Replaces the random credit card number
            display_acc_name = account_name.lower()
            
            # Calculate width to center it
            if hasattr(draw, 'textlength'):
                acc_width = draw.textlength(display_acc_name, font=font_large)
            else:
                acc_width = font_large.getsize(display_acc_name)[0]
            
            # Center X = (Image Width - Text Width) / 2
            # Y = 55 (Middle-ish)
            center_x = (width - acc_width) / 2
            self.draw_text_with_shadow(draw, (center_x, 55), display_acc_name, font_large, (255, 255, 255))

            # B. "VALID THRU" Date (Moved Right)
            # Previous X was ~85. Moving to ~125 to clear the centered text
            label_x = 125
            date_x = 148
            
            self.draw_text_with_shadow(draw, (label_x, 75), "VALID", font_small, (200, 200, 200), offset=(0,1))
            self.draw_text_with_shadow(draw, (label_x, 82), "THRU", font_small, (200, 200, 200), offset=(0,1))
            self.draw_text_with_shadow(draw, (date_x, 78), "12/30", font_medium, (255, 255, 255))

            # C. Card Holder Name (Bottom Left)
            # Moved up slightly (Y=92) to make room for ID underneath
            display_name = holder_name.upper()
            if len(display_name) > 22: display_name = display_name[:20] + ".."
            
            self.draw_text_with_shadow(draw, (12, 92), display_name, font_medium, (255, 255, 255))

            # D. Internal Account ID (Under Name)
            # Moved from bottom right to bottom left, directly under name
            client_id_str = f"ID: {account_name.upper()}"
            
            # Y=105 is below the name
            self.draw_text_with_shadow(draw, (12, 105), client_id_str, font_small, (200, 200, 200), offset=(0,1))

            # E. Balance (Top Right - HUD Style)
            balance_str = f"${balance:,.2f}"
            
            if hasattr(draw, 'textlength'):
                bal_width = draw.textlength(balance_str, font=font_xl)
            else:
                bal_width = font_xl.getsize(balance_str)[0]

            # Position: Top Right (Y=8)
            self.draw_text_with_shadow(draw, (width - bal_width - 10, 8), balance_str, font_xl, (255, 215, 0), shadow_color=(0,0,0,200), offset=(1,1))

            # 4. Save to buffer
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            buffer.seek(0)
            return buffer

        except Exception as e:
            logger.error(f"Error generating card: {e}")
            return None