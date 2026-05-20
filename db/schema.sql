-- ============================================================
-- TopicFinder 数据库建表脚本
-- 数据库: topicfinder (MySQL 5.7+)
-- 字符集: utf8mb4
-- ============================================================

CREATE DATABASE IF NOT EXISTS topicfinder
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE topicfinder;

-- ============================================================
-- 1. 知识结构
-- ============================================================

-- 教材版本
CREATE TABLE versions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(64)  NOT NULL COMMENT '版本名称，如 苏教版、人教版',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教材版本';

-- 年级
CREATE TABLE grades (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version_id INT UNSIGNED NOT NULL COMMENT '所属版本',
  name       VARCHAR(32)  NOT NULL COMMENT '年级名称，如 四年级',
  sort_order INT          NOT NULL DEFAULT 0 COMMENT '排序',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_version_name (version_id, name),
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='年级';

-- 学科
CREATE TABLE subjects (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  grade_id   INT UNSIGNED NOT NULL COMMENT '所属年级',
  name       VARCHAR(32)  NOT NULL COMMENT '学科名称，如 数学、语文',
  sort_order INT          NOT NULL DEFAULT 0 COMMENT '排序',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_grade_name (grade_id, name),
  FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学科';

-- 知识点
CREATE TABLE knowledge_points (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_id  INT UNSIGNED NOT NULL COMMENT '所属学科',
  name        VARCHAR(128) NOT NULL COMMENT '知识点名称，如 一元一次方程',
  description TEXT         COMMENT '知识点描述',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_subject_name (subject_id, name),
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识点';

-- 知识点与教材版本多对多关联
CREATE TABLE kp_versions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kp_id      INT UNSIGNED NOT NULL,
  version_id INT UNSIGNED NOT NULL,
  UNIQUE KEY uk_kp_version (kp_id, version_id),
  FOREIGN KEY (kp_id)      REFERENCES knowledge_points(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES versions(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识点与教材版本关联';

-- ============================================================
-- 2. 题目库
-- ============================================================

CREATE TABLE questions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  knowledge_point_id INT UNSIGNED NOT NULL COMMENT '所属知识点',
  type              ENUM('choice','fill','essay') NOT NULL COMMENT '题型',
  difficulty        ENUM('easy','medium','hard')  NOT NULL DEFAULT 'easy' COMMENT '难度',
  stem              TEXT         NOT NULL COMMENT '题干',
  options           JSON         COMMENT '选择题选项 JSON 数组',
  answer            VARCHAR(512) NOT NULL COMMENT '正确答案',
  explanation       TEXT         COMMENT '解析',
  solution_steps    JSON         COMMENT '解题步骤 JSON 数组',
  common_mistakes   JSON         COMMENT '常见误区 JSON 数组',
  concept_tags      JSON         COMMENT '概念标签 JSON 数组',
  review_status     ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  version           INT          NOT NULL DEFAULT 1 COMMENT '题目版本号',
  usage_count       INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '被使用次数',
  correct_count     INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '被正确回答次数',
  report_count      INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '被举报次数',
  report_reason     TEXT         COMMENT '举报原因',
  created_by        INT UNSIGNED COMMENT '创建者 admin id',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kp (knowledge_point_id),
  INDEX idx_type (type),
  INDEX idx_difficulty (difficulty),
  INDEX idx_review (review_status),
  FOREIGN KEY (knowledge_point_id) REFERENCES knowledge_points(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='题目';

-- ============================================================
-- 3. 学生
-- ============================================================

CREATE TABLE students (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  openid              VARCHAR(64)  NOT NULL COMMENT '微信 openid',
  nickname            VARCHAR(64)  COMMENT '微信昵称',
  avatar_url          VARCHAR(512) COMMENT '头像 URL',
  trial_expires_at    DATETIME     NOT NULL COMMENT '试用期截止时间',
  subscription_status ENUM('trial','active','expired') NOT NULL DEFAULT 'trial' COMMENT '订阅状态',
  subscription_expires_at DATETIME COMMENT '订阅截止时间',
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生';

-- ============================================================
-- 4. 答题记录
-- ============================================================

CREATE TABLE answer_records (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id        INT UNSIGNED NOT NULL,
  question_id       INT UNSIGNED NOT NULL,
  knowledge_point_id INT UNSIGNED NOT NULL COMMENT '冗余字段，加速查询',
  is_correct        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否正确',
  answered_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student_kp (student_id, knowledge_point_id),
  INDEX idx_student_date (student_id, answered_at),
  INDEX idx_kp (knowledge_point_id),
  FOREIGN KEY (student_id)  REFERENCES students(id)  ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='答题记录';

-- ============================================================
-- 5. 错题本
-- ============================================================

CREATE TABLE wrong_notes (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id         INT UNSIGNED NOT NULL,
  question_id        INT UNSIGNED NOT NULL,
  knowledge_point_id INT UNSIGNED NOT NULL COMMENT '冗余字段',
  consecutive_correct INT         NOT NULL DEFAULT 0 COMMENT '连续正确次数',
  last_correct_at    DATETIME     COMMENT '上次正确时间',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_student_question (student_id, question_id),
  INDEX idx_student (student_id),
  INDEX idx_kp_student (knowledge_point_id, student_id),
  FOREIGN KEY (student_id)  REFERENCES students(id)  ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='错题本';

-- ============================================================
-- 6. 生成任务队列
-- ============================================================

CREATE TABLE generation_tasks (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  knowledge_point_id INT UNSIGNED NOT NULL,
  question_types    JSON         NOT NULL COMMENT '题型列表 ["choice","fill","essay"]',
  difficulty        ENUM('easy','medium','hard') NOT NULL DEFAULT 'easy',
  count             INT          NOT NULL DEFAULT 10 COMMENT '生成数量',
  status            ENUM('pending','running','done','failed') NOT NULL DEFAULT 'pending',
  progress          INT          NOT NULL DEFAULT 0 COMMENT '进度 0-100',
  error_message     TEXT         COMMENT '错误信息',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_kp_status (knowledge_point_id, status),
  FOREIGN KEY (knowledge_point_id) REFERENCES knowledge_points(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='LLM 生成任务队列';

-- ============================================================
-- 7. Prompt 模板
-- ============================================================

CREATE TABLE prompts (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prompt_key  VARCHAR(64)  NOT NULL COMMENT '模板标识，如 tutor_system',
  template    TEXT         NOT NULL COMMENT 'Prompt 模板，支持 {{variable}} 变量',
  description VARCHAR(256) COMMENT '描述',
  version     INT          NOT NULL DEFAULT 1 COMMENT '版本号',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_key (prompt_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='LLM Prompt 模板';

-- ============================================================
-- 8. 支付订单
-- ============================================================

CREATE TABLE orders (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id          INT UNSIGNED NOT NULL,
  order_no            VARCHAR(32)  NOT NULL COMMENT '订单号',
  amount              DECIMAL(10,2) NOT NULL COMMENT '金额（元）',
  status              ENUM('pending','paid','refunded') NOT NULL DEFAULT 'pending',
  payment_method      VARCHAR(16)  NOT NULL DEFAULT 'wechat' COMMENT '支付方式',
  subscription_months INT          NOT NULL DEFAULT 1 COMMENT '订阅月数',
  paid_at             DATETIME,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_order_no (order_no),
  INDEX idx_student (student_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付订单';

-- ============================================================
-- 9. 管理员
-- ============================================================

CREATE TABLE admins (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL COMMENT '登录账号',
  password_hash VARCHAR(256) NOT NULL COMMENT 'bcrypt 哈希',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员';

-- ============================================================
-- 10. 系统配置
-- ============================================================

CREATE TABLE system_config (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  config_key   VARCHAR(64)  NOT NULL COMMENT '配置键',
  config_value TEXT         NOT NULL COMMENT '配置值',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置';
