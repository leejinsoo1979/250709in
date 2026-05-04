# tttcraft for SketchUp - DAE Importer
#
# JS에서 받은 base64 DAE 데이터를 임시 파일로 저장 후 active model에 import한다.

require 'base64'
require 'fileutils'
require 'tmpdir'
require 'json'

module TTTCraft
  module Importer
    TMP_SUBDIR = 'tttcraft_sketchup'.freeze

    # base64로 인코딩된 DAE 데이터를 받아 SketchUp에 import.
    #
    # @param base64_data [String] base64 인코딩된 DAE XML
    # @param filename    [String] 권장 파일명 (확장자 .dae)
    # @param dialog      [UI::HtmlDialog, nil] 결과를 JS로 알리기 위한 다이얼로그 핸들
    def self.import_from_base64(base64_data, filename, dialog = nil)
      tmp_path = nil
      success = false

      begin
        safe_name = sanitize_filename(filename)
        tmp_dir = File.join(Dir.tmpdir, TMP_SUBDIR)
        FileUtils.mkdir_p(tmp_dir)
        tmp_path = File.join(tmp_dir, safe_name)

        File.binwrite(tmp_path, Base64.decode64(base64_data.to_s))

        model = Sketchup.active_model
        if model.nil?
          notify(dialog, false, 'No active SketchUp model')
          return
        end

        operation_name = 'Import from tttcraft'
        model.start_operation(operation_name, true)

        # 임포트 직전 entities 개수를 기록해서 새로 추가된 객체만 후처리
        existing_uuids = collect_top_level_uuids(model)

        # SketchUp 2014+ 시그니처: model.import(path, options_hash)
        import_options = {
          'show_summary' => false,
          'merge_coplanar_faces' => true   # SketchUp이 공평면 삼각형을 사각형으로 자동 병합
        }

        success = begin
          model.import(tmp_path, import_options)
        rescue ArgumentError
          # 구버전 폴백
          model.import(tmp_path, false)
        end

        if success
          # 임포트로 새로 추가된 객체들에서 mesh 이름으로 태그 자동 생성/할당
          tag_count = assign_tags_by_mesh_name(model, existing_uuids)
          model.commit_operation
          UI.messagebox(
            "tttcraft 디자인을 가져왔습니다!#{tag_count > 0 ? "\n태그 #{tag_count}개 생성" : ''}",
            MB_OK
          )
        else
          model.abort_operation
          UI.messagebox('SketchUp으로 가져오기에 실패했습니다.', MB_OK)
        end

        notify(dialog, success)
      rescue StandardError => e
        warn "[tttcraft] import error: #{e.class}: #{e.message}"
        warn e.backtrace.first(5).join("\n") if e.backtrace
        notify(dialog, false, e.message)
      ensure
        if tmp_path && File.exist?(tmp_path)
          begin
            File.delete(tmp_path)
          rescue StandardError
            # 삭제 실패는 무시
          end
        end
      end
    end

    # === 태그 자동 생성 후처리 ===

    # 임포트 직전 모델 최상위 엔티티의 UUID set
    def self.collect_top_level_uuids(model)
      set = {}
      model.entities.each { |e| set[e.entityID] = true }
      set
    end

    # mesh 이름에서 패널 이름 추출 (CNC 옵티마이저와 동일 규칙)
    def self.extract_panel_name(raw)
      return nil if raw.nil? || raw.empty?
      n = raw.dup
      n = n.sub(/^(furniture-mesh-|back-panel-mesh-)/, '')
      n = n.sub(/^(furniture-edge-|back-panel-edge-)/, '')
      n = n.sub(/-mesh$/, '')
      n = n.sub(/-\d+$/, '')
      s = n.strip
      s.empty? ? nil : s
    end

    # 태그(레이어) 가져오거나 생성
    def self.ensure_layer(model, name)
      layer = model.layers[name]
      layer ||= model.layers.add(name)
      layer
    end

    # 임포트 직후, 새로 추가된 객체들 traverse하면서
    # mesh/group 이름으로 태그를 만들고 부모 그룹/컴포넌트에 할당.
    # @return [Integer] 생성된 태그 개수
    def self.assign_tags_by_mesh_name(model, existing_uuids)
      created = {}

      model.entities.each do |top|
        next if existing_uuids[top.entityID]
        traverse_for_tags(top, model, created)
      end

      created.size
    rescue StandardError => e
      warn "[tttcraft] assign_tags error: #{e.class}: #{e.message}"
      0
    end

    # 재귀 traverse:
    #  - Group / ComponentInstance / ComponentDefinition 이름에서 패널 이름 추출
    #  - 추출되면 객체와 내부 면들에 태그 할당
    #  - 자식까지 깊이 우선 traverse
    def self.traverse_for_tags(obj, model, created)
      # 패널 이름 후보: 인스턴스 자체 이름, 정의 이름 둘 다 검사
      candidate_names = []
      candidate_names << obj.name if obj.respond_to?(:name)
      if obj.respond_to?(:definition) && obj.definition
        candidate_names << obj.definition.name if obj.definition.respond_to?(:name)
      end

      panel_name = nil
      candidate_names.compact.each do |raw|
        panel_name = extract_panel_name(raw)
        break if panel_name
      end

      if panel_name
        layer = ensure_layer(model, panel_name)
        created[panel_name] = true

        # 자기 자신에 layer 부여
        obj.layer = layer if obj.respond_to?(:layer=)

        # 내부 entities (Group이면 obj.entities, ComponentInstance면 obj.definition.entities)
        sub_entities =
          if obj.respond_to?(:entities)
            obj.entities
          elsif obj.respond_to?(:definition) && obj.definition
            obj.definition.entities
          end

        if sub_entities
          sub_entities.each do |e|
            # Face/Edge에 layer 부여 (태그 패널에 표시되도록)
            e.layer = layer if e.respond_to?(:layer=)
          end
        end
      end

      # 자식 traverse
      sub =
        if obj.respond_to?(:entities)
          obj.entities
        elsif obj.respond_to?(:definition) && obj.definition
          obj.definition.entities
        end
      return unless sub

      sub.each do |child|
        if child.is_a?(Sketchup::Group) || child.is_a?(Sketchup::ComponentInstance)
          traverse_for_tags(child, model, created)
        end
      end
    rescue StandardError => e
      warn "[tttcraft] traverse_for_tags error: #{e.class}: #{e.message}"
    end

    # JS 콜백으로 import 결과를 통지.
    def self.notify(dialog, success, error_message = nil)
      return unless dialog && dialog.respond_to?(:execute_script)

      payload = {
        success: success ? true : false,
        error: error_message
      }
      js_payload = payload.to_json rescue '{"success":false}'
      dialog.execute_script("window.__sketchupImportDone && window.__sketchupImportDone(#{js_payload});")
    rescue StandardError => e
      warn "[tttcraft] notify error: #{e.message}"
    end

    # 임시 파일명을 안전하게 정리.
    def self.sanitize_filename(name)
      base = (name && !name.empty?) ? name : "tttcraft_#{Time.now.to_i}.dae"
      base = base.gsub(/[^A-Za-z0-9_\-\.]/, '_')
      base = "#{base}.dae" unless base.downcase.end_with?('.dae')
      base
    end
  end
end
