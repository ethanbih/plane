# Plane BIH

## Đây là gì

Fork Plane v1.4.2 của BIH, thêm mũi tên phụ thuộc Finish-to-Start trên Gantt. Nút **Phụ thuộc** được nhớ trong localStorage; mũi tên đỏ khi ngày bắt đầu việc sau không muộn hơn ngày kết thúc việc trước. Chỉ đọc, chưa tự động lên lịch. Giấy phép AGPL-3.0; source công khai tại https://github.com/ethanbih/plane.

## Build image trên VM (ngoài giờ)

```sh
git fetch && git checkout bih/v1.4.2 && git pull
docker build -f apps/web/Dockerfile.web -t bih/plane-frontend:v1.4.2-bih.<N> .
```

Thay `<N>` bằng số bản build trước khi chạy. Chỉ image web là tùy chỉnh; các image khác giữ `makeplane/*:v1.4.2`. Thời gian đo được: ~1 phút 47 giây trên VM srv-AI (2026-10-30), ~2 phút 15 giây trên máy dev. Source trên VM ở `/opt/bih-plane-src` (thuộc root ⇒ lệnh git cần `sudo`).

## Dùng trong BIH-OPS

Đặt `PLANE_FRONTEND_IMAGE=bih/plane-frontend:v1.4.2-bih.<N>` trong env của Plane, rồi chạy `docker compose … up -d --no-deps plane-web` (`--no-deps` để không khởi động lại db/api; thay `…` bằng tham số compose của BIH-OPS). Rollback: bỏ biến này để trở về `makeplane/plane-frontend:v1.4.2`, rồi chạy lại lệnh compose.

## Nâng Plane

Chạy `git fetch upstream --tags`, tạo nhánh `bih/<new-tag>` từ tag mới. Rebase các thay đổi BIH bằng `git rebase --onto <new-tag> v1.4.2 bih/v1.4.2`; lệnh này chuyển sang nhánh cũ và cập nhật nó. Sau khi sửa conflict, đưa nhánh `bih/<new-tag>` tới kết quả rebase và chuyển sang nhánh mới. Kiểm tra rồi build image mới. Phiên bản Plane nền của frontend image và backend `APP_RELEASE` phải giống nhau.

## Kiểm tra

```sh
node --test apps/web/core/components/gantt-chart/dependencies/dependency-utils.test.mjs
pnpm --filter web check:types
pnpm --filter web check:lint
```
