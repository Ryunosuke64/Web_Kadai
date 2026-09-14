-- 接続先のデータベース内で実行します。既存の記録は削除しません。
CREATE TABLE IF NOT EXISTS play_results (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    defeated_count INT UNSIGNED NOT NULL,
    weapon_1_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    weapon_2_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_run (run_id),
    INDEX ranking_order (defeated_count DESC, id ASC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
