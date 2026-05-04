# tttcraft for SketchUp - Panel Importer
#
# 웹앱에서 받은 패널 그룹 JSON을 직접 SketchUp 모델에 그룹/태그로 생성한다.
# DAE 임포트의 한계(노드 트리/이름/layer 정보 손실)를 우회.
#
# JSON 페이로드 구조:
# {
#   "designName": "...",
#   "groups": [
#     {
#       "name": "좌측판",
#       "meshes": [
#         {
#           "vertices": [x1,y1,z1, x2,y2,z2, ...],   # mm 단위, Z-up
#           "indices":  [i1,i2,i3, i4,i5,i6, ...],   # 삼각형
#           "color":    {"r":200,"g":200,"b":200},   # 0~255
#           "opacity":  1.0
#         }
#       ]
#     }
#   ],
#   "unnamed": [ ...mesh... ]
# }

require 'json'

module TTTCraft
  module PanelImporter
    # SketchUp 내부 단위는 inch. 1 inch = 25.4 mm.
    MM_TO_INCH = 1.0 / 25.4

    # 메인 진입점.
    # @param json_string [String] sceneToPanelJSON 결과 JSON 문자열
    # @param dialog      [UI::HtmlDialog, nil] 결과 통지용 다이얼로그
    def self.import_from_json(json_string, dialog = nil)
      payload = JSON.parse(json_string)

      model = Sketchup.active_model
      if model.nil?
        notify(dialog, false, 'No active SketchUp model')
        return
      end

      operation_name = "Import from tttcraft (#{payload['designName'] || 'design'})"
      model.start_operation(operation_name, true)

      total_meshes = 0
      total_groups = 0
      success = false

      begin
        # 명명된 패널 그룹 처리
        groups = payload['groups'] || []
        groups.each do |group_data|
          name = group_data['name'].to_s
          meshes = group_data['meshes'] || []
          next if meshes.empty?

          # 1) 같은 이름의 SketchUp 태그(Layer) 가져오거나 생성
          layer = ensure_layer(model, name)

          # 2) SketchUp 그룹 생성 (모델 최상위)
          group = model.entities.add_group
          group.name = name
          group.layer = layer

          # 3) 각 메시 면을 그룹 내부에 추가
          meshes.each do |mesh_data|
            count = add_mesh_to_entities(group.entities, mesh_data)
            total_meshes += count
          end

          total_groups += 1
        end

        # 이름 없는 메시들도 추가 (기타 그룹)
        unnamed = payload['unnamed'] || []
        unless unnamed.empty?
          group = model.entities.add_group
          group.name = '기타'
          unnamed.each do |mesh_data|
            count = add_mesh_to_entities(group.entities, mesh_data)
            total_meshes += count
          end
          total_groups += 1
        end

        success = total_groups > 0

        if success
          model.commit_operation
          puts "[tttcraft] 임포트 완료: 그룹=#{total_groups}, 면=#{total_meshes}"
          UI.messagebox("tttcraft 디자인을 가져왔습니다!\n그룹 #{total_groups}개, 면 #{total_meshes}개")
        else
          model.abort_operation
          UI.messagebox('가져올 데이터가 비어있습니다.')
        end

        notify(dialog, success)
      rescue StandardError => e
        warn "[tttcraft] panel import error: #{e.class}: #{e.message}"
        warn e.backtrace.first(8).join("\n") if e.backtrace
        model.abort_operation rescue nil
        notify(dialog, false, e.message)
      end
    end

    # SketchUp 태그(레이어)를 가져오거나 생성.
    def self.ensure_layer(model, name)
      return nil if name.nil? || name.empty?
      layer = model.layers[name]
      layer ||= model.layers.add(name)
      layer
    end

    # 메시 데이터에서 정점/면을 entities에 추가.
    # @return [Integer] 생성된 face 개수
    def self.add_mesh_to_entities(entities, mesh_data)
      vertices_flat = mesh_data['vertices']
      indices = mesh_data['indices']
      return 0 unless vertices_flat && indices

      color = mesh_data['color'] || {}
      opacity = (mesh_data['opacity'] || 1.0).to_f

      # 정점 배열을 [Point3d, Point3d, ...] 로 변환
      points = []
      i = 0
      while i < vertices_flat.length
        x_mm = vertices_flat[i].to_f
        y_mm = vertices_flat[i + 1].to_f
        z_mm = vertices_flat[i + 2].to_f
        points << Geom::Point3d.new(
          x_mm * MM_TO_INCH,
          y_mm * MM_TO_INCH,
          z_mm * MM_TO_INCH
        )
        i += 3
      end

      # 재질 준비
      material = make_material(color, opacity)

      face_count = 0
      tri_count = indices.length / 3

      tri_count.times do |t|
        idx_a = indices[t * 3]
        idx_b = indices[t * 3 + 1]
        idx_c = indices[t * 3 + 2]
        next if idx_a.nil? || idx_b.nil? || idx_c.nil?

        a = points[idx_a]
        b = points[idx_b]
        c = points[idx_c]
        next if a.nil? || b.nil? || c.nil?
        next if degenerate_triangle?(a, b, c)

        begin
          face = entities.add_face(a, b, c)
          if face
            face.material = material if material
            face.back_material = material if material
            face_count += 1
          end
        rescue ArgumentError
          # 동일 평면 면 중복 등 SketchUp 거부 - 무시
        end
      end

      face_count
    end

    def self.make_material(color, opacity)
      model = Sketchup.active_model
      r = (color['r'] || 200).to_i
      g = (color['g'] || 200).to_i
      b = (color['b'] || 200).to_i

      key = format('tttcraft_%02x%02x%02x_%03d', r, g, b, (opacity * 100).to_i)
      mat = model.materials[key]
      return mat if mat

      mat = model.materials.add(key)
      mat.color = Sketchup::Color.new(r, g, b)
      mat.alpha = opacity if opacity < 1.0
      mat
    end

    def self.degenerate_triangle?(a, b, c)
      ab = b - a
      ac = c - a
      cross = ab.cross(ac)
      cross.length < 1e-10
    end

    def self.notify(dialog, success, error_message = nil)
      return unless dialog && dialog.respond_to?(:execute_script)
      payload = { success: success ? true : false, error: error_message }
      js_payload = payload.to_json rescue '{"success":false}'
      dialog.execute_script("window.__sketchupImportDone && window.__sketchupImportDone(#{js_payload});")
    rescue StandardError => e
      warn "[tttcraft] notify error: #{e.message}"
    end
  end
end
