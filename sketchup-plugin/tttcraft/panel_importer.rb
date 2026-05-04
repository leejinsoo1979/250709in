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

          # 같은 평면 분할선 숨김 (사각형이 사각형으로 보이게)
          hide_coplanar_edges(group.entities)

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
          hide_coplanar_edges(group.entities)
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

    # 메시 데이터를 원본 정점/삼각형 그대로 추가 (박스 강제 변환 없음).
    # PolygonMesh로 빌드 → add_faces_from_mesh로 일괄 추가.
    # 박스/원기둥/프레임/곡면 모두 원래 모양대로 유지.
    # 후처리에서 공평면 가장자리만 hide 처리하여 사각형 분할선이 시각적으로 사라짐.
    # @return [Integer] 생성된 face 개수
    def self.add_mesh_to_entities(entities, mesh_data)
      vertices_flat = mesh_data['vertices']
      indices = mesh_data['indices']
      return 0 unless vertices_flat && indices && vertices_flat.length >= 9

      color = mesh_data['color'] || {}
      opacity = (mesh_data['opacity'] || 1.0).to_f
      material = make_material(color, opacity)

      vertex_count = vertices_flat.length / 3
      tri_count = indices.length / 3
      return 0 if vertex_count < 3 || tri_count == 0

      mesh = Geom::PolygonMesh.new(vertex_count, tri_count)
      point_indices = []
      i = 0
      while i < vertices_flat.length
        x_mm = vertices_flat[i].to_f
        y_mm = vertices_flat[i + 1].to_f
        z_mm = vertices_flat[i + 2].to_f
        pt = Geom::Point3d.new(
          x_mm * MM_TO_INCH,
          y_mm * MM_TO_INCH,
          z_mm * MM_TO_INCH
        )
        point_indices << mesh.add_point(pt)
        i += 3
      end

      tri_count.times do |t|
        a = indices[t * 3]
        b = indices[t * 3 + 1]
        c = indices[t * 3 + 2]
        next if a.nil? || b.nil? || c.nil?
        pa = point_indices[a]; pb = point_indices[b]; pc = point_indices[c]
        next if pa.nil? || pb.nil? || pc.nil?
        next if pa == pb || pb == pc || pa == pc
        begin
          mesh.add_polygon(pa, pb, pc)
        rescue ArgumentError
          # 잘못된 폴리곤 - 무시
        end
      end

      # smooth_flags = 0: smooth shading 없음 (그라데이션 안 생김), 모든 가장자리 보임
      added = entities.add_faces_from_mesh(mesh, 0, material, material)
      added.is_a?(Integer) ? added : mesh.polygons.length
    end

    def self.safe_add_face(entities, points)
      entities.add_face(*points)
    rescue ArgumentError
      nil
    end

    # 그룹/엔티티 안에서 양쪽에 면이 있고 두 면이 같은 평면(또는 거의 같은 법선)인
    # 가장자리를 hide + soft + smooth 처리.
    PLANAR_DOT_THRESHOLD = 0.9999  # cos(약 0.8°)

    def self.hide_coplanar_edges(entities)
      entities.grep(Sketchup::Edge).each do |edge|
        faces = edge.faces
        next unless faces.length == 2
        n1 = faces[0].normal
        n2 = faces[1].normal
        next if n1.length == 0 || n2.length == 0
        if n1.dot(n2).abs >= PLANAR_DOT_THRESHOLD
          # hidden만 true (soft/smooth는 그라데이션 셰이딩을 일으키므로 사용 안 함)
          edge.hidden = true
          edge.soft = false
          edge.smooth = false
        end
      end
    rescue StandardError => e
      warn "[tttcraft] hide_coplanar_edges error: #{e.message}"
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
