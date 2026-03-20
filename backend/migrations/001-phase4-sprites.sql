-- Phase 4: Team Sprite History
-- Run against existing database to add sprite history tracking.

CREATE TABLE IF NOT EXISTS team_sprite_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  sprite_url VARCHAR(255) NOT NULL,
  sprite_width INT NOT NULL,
  sprite_height INT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);
