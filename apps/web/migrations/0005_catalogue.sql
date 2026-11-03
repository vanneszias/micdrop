-- Preserve legacy privacy and public snapshots. Never publish old private libraries.
CREATE TABLE catalogue_songs (id TEXT PRIMARY KEY, title TEXT NOT NULL, merged_into TEXT REFERENCES catalogue_songs(id));
CREATE TABLE catalogue_admins (user_id TEXT PRIMARY KEY REFERENCES user(id));
CREATE TABLE catalogue_reports (id TEXT PRIMARY KEY, publication_id TEXT NOT NULL REFERENCES publications(id), user_id TEXT NOT NULL REFERENCES user(id), reason TEXT NOT NULL, created_at TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
CREATE TABLE catalogue_actions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), action TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
ALTER TABLE publications ADD COLUMN song_id TEXT REFERENCES catalogue_songs(id);
ALTER TABLE publications ADD COLUMN moderated INTEGER NOT NULL DEFAULT 0;
CREATE INDEX publications_song ON publications(song_id, hidden, moderated);
CREATE INDEX catalogue_reports_open ON catalogue_reports(resolved, created_at);
INSERT INTO catalogue_songs (id,title) SELECT id,json_extract(data,'$.title') FROM records WHERE kind='arrangement';
UPDATE records SET data=json_set(data,'$.songId',id,'$.visibility',CASE WHEN EXISTS(SELECT 1 FROM publications p WHERE p.record_id=records.id AND p.hidden=0) THEN 'public' ELSE 'private' END) WHERE kind='arrangement';
UPDATE publications SET song_id=record_id, data=json_set(json_remove(data,'$.privateNotes','$.performanceKey','$.performanceCapo','$.preferred','$.draft','$.visibility'),'$.rawSource','','$.songId',record_id);
CREATE VIRTUAL TABLE catalogue_grams USING fts5(publication_id UNINDEXED, metadata, tokenize='trigram');
INSERT INTO catalogue_grams SELECT id,json_extract(data,'$.title') || ' ' || json_extract(data,'$.artist') || ' ' || COALESCE(json_extract(data,'$.arrangementName'),'') FROM publications WHERE hidden=0 AND moderated=0;
DELETE FROM publication_search;
INSERT INTO publication_search SELECT id,json_extract(data,'$.title'),json_extract(data,'$.artist') || ' ' || COALESCE(json_extract(data,'$.arrangementName'),''),json_extract(data,'$.content'),COALESCE(json_extract(data,'$.tags'),'[]') FROM publications WHERE hidden=0 AND moderated=0;
CREATE TRIGGER catalogue_publication_insert AFTER INSERT ON publications BEGIN
 DELETE FROM publication_search WHERE publication_id=NEW.id;
 DELETE FROM catalogue_grams WHERE publication_id=NEW.id;
 INSERT INTO publication_search SELECT NEW.id,json_extract(NEW.data,'$.title'),json_extract(NEW.data,'$.artist') || ' ' || COALESCE(json_extract(NEW.data,'$.arrangementName'),''),json_extract(NEW.data,'$.content'),COALESCE(json_extract(NEW.data,'$.tags'),'[]') WHERE NEW.hidden=0 AND NEW.moderated=0;
 INSERT INTO catalogue_grams SELECT NEW.id,json_extract(NEW.data,'$.title') || ' ' || json_extract(NEW.data,'$.artist') || ' ' || COALESCE(json_extract(NEW.data,'$.arrangementName'),'') WHERE NEW.hidden=0 AND NEW.moderated=0;
 END;
CREATE TRIGGER catalogue_publication_update AFTER UPDATE ON publications BEGIN
 DELETE FROM publication_search WHERE publication_id=NEW.id;
 DELETE FROM catalogue_grams WHERE publication_id=NEW.id;
 INSERT INTO publication_search SELECT NEW.id,json_extract(NEW.data,'$.title'),json_extract(NEW.data,'$.artist') || ' ' || COALESCE(json_extract(NEW.data,'$.arrangementName'),''),json_extract(NEW.data,'$.content'),COALESCE(json_extract(NEW.data,'$.tags'),'[]') WHERE NEW.hidden=0 AND NEW.moderated=0;
 INSERT INTO catalogue_grams SELECT NEW.id,json_extract(NEW.data,'$.title') || ' ' || json_extract(NEW.data,'$.artist') || ' ' || COALESCE(json_extract(NEW.data,'$.arrangementName'),'') WHERE NEW.hidden=0 AND NEW.moderated=0;
 END;
CREATE TRIGGER catalogue_record_insert AFTER INSERT ON records WHEN NEW.kind='arrangement' BEGIN
 INSERT OR IGNORE INTO catalogue_songs(id,title) VALUES(COALESCE(json_extract(NEW.data,'$.songId'),NEW.id),json_extract(NEW.data,'$.title'));
 UPDATE publications SET hidden=1 WHERE record_id=NEW.id AND (NEW.archived=1 OR COALESCE(json_extract(NEW.data,'$.visibility'),'private')='private');
 INSERT INTO publications(id,record_id,owner,data,updated_at,hidden,song_id)
 SELECT NEW.id,NEW.id,NEW.owner,json_object('title',json_extract(NEW.data,'$.title'),'artist',json_extract(NEW.data,'$.artist'),'content',json_extract(NEW.data,'$.content'),'key',json_extract(NEW.data,'$.key'),'sourceCapo',COALESCE(json_extract(NEW.data,'$.sourceCapo'),0),'tags',json(COALESCE(json_extract(NEW.data,'$.tags'),'[]')),'sourceUrl',COALESCE(json_extract(NEW.data,'$.sourceUrl'),''),'rawSource','','copiedFrom',COALESCE(json_extract(NEW.data,'$.copiedFrom'),''),'songId',COALESCE(json_extract(NEW.data,'$.songId'),NEW.id),'arrangementName',COALESCE(json_extract(NEW.data,'$.arrangementName'),''),'description',COALESCE(json_extract(NEW.data,'$.description'),''),'contentHash',json_extract(NEW.data,'$.contentHash')),NEW.updated_at,0,COALESCE((SELECT COALESCE(merged_into,id) FROM catalogue_songs WHERE id=json_extract(NEW.data,'$.songId')),NEW.id)
 WHERE NEW.archived=0 AND json_extract(NEW.data,'$.visibility')='public' AND COALESCE(json_extract(NEW.data,'$.draft'),0)=0 AND COALESCE(json_extract(NEW.data,'$.reviewRequired'),0)=0
 AND NOT EXISTS(SELECT 1 FROM publications p WHERE p.record_id!=NEW.id AND p.song_id=COALESCE(json_extract(NEW.data,'$.songId'),NEW.id) AND json_extract(p.data,'$.content')=json_extract(NEW.data,'$.content') AND p.hidden=0 AND p.moderated=0)
 ON CONFLICT(record_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,hidden=0,song_id=excluded.song_id;
 END;
CREATE TRIGGER catalogue_record_update AFTER UPDATE ON records WHEN NEW.kind='arrangement' BEGIN
 INSERT OR IGNORE INTO catalogue_songs(id,title) VALUES(COALESCE(json_extract(NEW.data,'$.songId'),NEW.id),json_extract(NEW.data,'$.title'));
 UPDATE publications SET hidden=1 WHERE record_id=NEW.id AND (NEW.archived=1 OR COALESCE(json_extract(NEW.data,'$.visibility'),'private')='private');
 INSERT INTO publications(id,record_id,owner,data,updated_at,hidden,song_id)
 SELECT NEW.id,NEW.id,NEW.owner,json_object('title',json_extract(NEW.data,'$.title'),'artist',json_extract(NEW.data,'$.artist'),'content',json_extract(NEW.data,'$.content'),'key',json_extract(NEW.data,'$.key'),'sourceCapo',COALESCE(json_extract(NEW.data,'$.sourceCapo'),0),'tags',json(COALESCE(json_extract(NEW.data,'$.tags'),'[]')),'sourceUrl',COALESCE(json_extract(NEW.data,'$.sourceUrl'),''),'rawSource','','copiedFrom',COALESCE(json_extract(NEW.data,'$.copiedFrom'),''),'songId',COALESCE(json_extract(NEW.data,'$.songId'),NEW.id),'arrangementName',COALESCE(json_extract(NEW.data,'$.arrangementName'),''),'description',COALESCE(json_extract(NEW.data,'$.description'),''),'contentHash',json_extract(NEW.data,'$.contentHash')),NEW.updated_at,0,COALESCE((SELECT COALESCE(merged_into,id) FROM catalogue_songs WHERE id=json_extract(NEW.data,'$.songId')),NEW.id)
 WHERE NEW.archived=0 AND json_extract(NEW.data,'$.visibility')='public' AND COALESCE(json_extract(NEW.data,'$.draft'),0)=0 AND COALESCE(json_extract(NEW.data,'$.reviewRequired'),0)=0
 AND NOT EXISTS(SELECT 1 FROM publications p WHERE p.record_id!=NEW.id AND p.song_id=COALESCE(json_extract(NEW.data,'$.songId'),NEW.id) AND json_extract(p.data,'$.content')=json_extract(NEW.data,'$.content') AND p.hidden=0 AND p.moderated=0)
 ON CONFLICT(record_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,hidden=0,song_id=excluded.song_id;
 END;
