// 微信AppID配置
        const WECHAT_APP_ID = 'wx80adbb9e0061ee26';
        const CALLBACK_URL = 'https://capoo.site/eacy/website/wechat-login-callback.html';

        // 生成微信登录二维码
        function generateQRCode() {
            const qrContainer = document.getElementById('qrContainer');
            const qrLoading = document.getElementById('qrLoading');
            const qrImage = document.getElementById('qrImage');

            // 回调地址
            const redirectUri = encodeURIComponent(CALLBACK_URL);

            // 状态参数
            const state = 'STATE_' + Date.now();

            // 构建微信授权URL
            const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${WECHAT_APP_ID}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_userinfo&state=${state}&forcePopup=true#wechat_redirect`;

            console.log('授权URL:', authUrl);

            try {
                // 使用在线二维码生成API
                const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(authUrl)}`;

                // 创建图片元素
                const img = document.createElement('img');
                img.src = qrApiUrl;
                img.alt = '微信登录二维码';

                img.onload = function() {
                    qrLoading.style.display = 'none';
                    qrImage.style.display = 'block';
                    qrImage.innerHTML = '';
                    qrImage.appendChild(img);
                };

                img.onerror = function() {
                    qrLoading.textContent = '二维码加载失败，请刷新页面';
                };

            } catch (error) {
                qrLoading.textContent = '生成二维码失败';
                console.error('二维码生成错误:', error);
            }
        }

        // 页面加载时生成二维码
        window.onload = function() {
            generateQRCode();
        };
