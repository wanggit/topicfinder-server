# TopicFinder (题探)

A Socratic math tutoring platform. Students learn through adaptive dialogue on a WeChat Mini Program; administrators manage knowledge structures and question banks via a web console; a backend service orchestrates everything.

## System Architecture

**小程序端 (Mini-Program)**:
A Taro-based WeChat Mini Program for students. Compiles to both WeChat Mini Program and H5. Pages: Dashboard, Learning, Report, Wrong Notes, Profile, Leaderboard.
_Avoid_: 前端, client, app

**后台服务端 (Backend Service)**:
An Express.js server with MySQL 5.7. Serves both the mini-program API (`/api/*`) and the admin API (`/api/admin/*`). Deployed on WeChat Cloud Hosting.
_Avoid_: server, BFF, API gateway

**管理后台端 (Admin Backend)**:
A React SPA with Ant Design for administrators. Manages knowledge structures, question banks, reviews, prompts, and system configuration.
_Avoid_: dashboard, console, CMS

## Knowledge Structure

**教材版本 (Textbook Version)**:
A publisher-specific edition of curriculum. Top-level classifier. Examples: 苏教版, 人教版, 北师大版.
_Avoid_: edition, publisher, curriculum

**年级 (Grade)**:
A school year level within a Textbook Version. Example: 四年级, 五年级.
_Avoid_: level, year

**学科 (Subject)**:
A subject within a Grade. Examples: 数学, 语文, 英语.
_Avoid_: course, discipline

**知识点 (Knowledge Point)**:
A specific learning objective. Belongs to one Subject and relates many-to-many with Textbook Versions. Example: 一元一次方程.
_Avoid_: topic, concept, skill

## Question Bank

**题目 (Question)**:
A single problem stored in the bank. Has type, difficulty, stem, options, answer, explanation, teaching metadata (解题步骤, 易错点, 概念标签), creator, review status, version, and usage/correctness statistics.
_Avoid_: problem, exercise, item

**题型 (Question Type)**:
The format of a Question. Values: 选择题 (multiple choice), 填空题 (fill-in-the-blank), 解答题 (open-ended).
_Avoid_: format, kind

**难度 (Difficulty)**:
The difficulty tier of a Question. Values: 简单 (easy), 中等 (medium), 困难 (hard).
_Avoid_: level

## Question Lifecycle

**批量生成 (Batch Generation)**:
An administrator triggers an async task to generate N questions for a single Knowledge Point, specifying types and difficulty. LLM generates; another LLM reviews each question before insertion. Progress is tracked in the generation_tasks table.
_Avoid_: mass generate

**自动补充生成 (Auto-Supplement Generation)**:
When a student has correctly answered ≥70% of the questions for a Knowledge Point, the system asynchronously triggers LLM generation of new questions for that KP. The student is not blocked.
_Avoid_: auto-fill, replenish

**题目审核 (Question Review)**:
Two-tier review: (1) LLM-LLM automatic review during batch generation; (2) human review when a student reports an issue with a question.
_Avoid_: moderation, approval

**答题覆盖率 (Answer Coverage)**:
The percentage of a Knowledge Point's questions that a student has answered correctly. Triggers Auto-Supplement Generation at ≥70%.
_Avoid_: completion rate

## Learning Flow

**自由描述 (Free Description)**:
A student describes what they want to practice (text or voice). The system uses LLM to identify matching Knowledge Points, then selects 10 questions from the bank across all matched KPs in difficulty-ascending order. If the bank has no matching questions, LLM generates them on-the-fly and stores them.
_Avoid_: topic search, free input

**选题 (Question Selection)**:
The algorithm that picks questions for a student from the bank. Two modes: (1) difficulty-ascending for First Contact; (2) weak-point-priority for returning students.
_Avoid_: pick, recommend

**首次接触 (First Contact)**:
A student has never answered any question from a given Knowledge Point.
_Avoid_: new topic, first time

## Tutoring

**苏格拉底启发教学 (Socratic Tutoring)**:
An adaptive dialogue where the system guides the student toward understanding through hints rather than giving direct answers. Hint depth adapts: initial level set by historical accuracy on the Knowledge Point, then dynamically adjusted during the conversation based on student responses.
_Avoid_: hint system, guidance

**辅导对话 (Tutoring Dialogue)**:
A WebSocket-based, multi-turn conversation between student and tutor engine. Single LLM generates responses with content safety guardrails. Connection lifetime: from question selection start to learning session end.
_Avoid_: chat, conversation

**内容安全护栏 (Content Safety)**:
System prompt rules that prevent the tutor LLM from generating profanity, violence, political content, negativity, or internet slang.
_Avoid_: moderation, filter

## Student Lifecycle

**openid**:
The WeChat-issued identifier obtained via `wx.login`. Used as the student's persistent identity. Login is silent — no user action required.
_Avoid_: user ID, account ID

**免费试用期 (Free Trial)**:
First 3 months after a new student's first login. No quota limits during this period. After expiry, WeChat Pay subscription is required.
_Avoid_: trial period

**订阅付费 (Subscription)**:
Recurring payment via WeChat Pay after Free Trial expires. Managed by the Backend Service with order/callback handling.
_Avoid_: payment, membership, pro

**错题重练 (Wrong Question Retry)**:
A wrong question is considered mastered only after the student answers it correctly 3 consecutive times, with at least 1 day between each correct answer. Until then, it remains in the wrong-notes rotation.
_Avoid_: spaced repetition

## Admin

**管理员 (Administrator)**:
A single-role user with full access to the Admin Backend. Logs in with account/password credentials. Manages knowledge structures, question banks, reviews, generation tasks, prompts, users, orders, and system configuration.
_Avoid_: superadmin, operator, teacher

**Prompt 管理 (Prompt Management)**:
All LLM system prompts are stored in MySQL and editable via the Admin Backend. Changes take effect immediately without redeployment. Initial prompts are generated by LLM and reviewed by an administrator.
_Avoid_: template config, instruction config

## Relationships

- A **教材版本** contains many **年级**; a **年级** contains many **学科**; a **学科** contains many **知识点**
- A **知识点** relates many-to-many with **教材版本**
- A **知识点** has many **题目**
- A **题目** has one **题型** and one **难度**
- A **学生** (identified by **openid**) answers many **题目**; answered correctly = contributes to **答题覆盖率**
- A **管理员** creates **题目** via **批量生成**; the system triggers **自动补充生成** when **答题覆盖率** ≥ 70%
- A **辅导对话** starts when a student selects a **知识点** (via **自由描述** or direct navigation) and ends when the learning session concludes

## Example dialogue

> **Dev:** "When a student uses 自由描述, and the LLM identifies 3 知识点 but only 2 have questions in the bank — what happens?"
> **Domain expert:** "The system selects from the 2 banked 知识点 and generates questions on-the-fly for the third. The generated questions are stored so they're available next time."
>
> **Dev:** "If a student gets 14 out of 20 questions correct on a 知识点, does 自动补充生成 trigger?"
> **Domain expert:** "14/20 = 70% — yes, exactly at threshold. The system creates an async generation task. The student is not blocked."
>
> **Dev:** "How does the 苏格拉底 tutor know whether to give 2 hints or 5?"
> **Domain expert:** "Initial depth is set by the student's historical correctness on this 知识点. During the 辅导对话, if the student responds well, the tutor escalates faster. If they struggle, the tutor adds more intermediate hints."

## Flagged ambiguities

- "知识点" was discussed as both a tree node and a flat entry — resolved: hierarchical under Subject, but many-to-many with Textbook Version.
- "题库" was used to mean both the question bank and the generation pipeline — resolved: 题库 is the stored question collection only; generation is a separate concept.
- "审核" was used for both automatic LLM review and human review — resolved: 题目审核 covers both, with two tiers.
