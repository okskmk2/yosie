<template>
    <div class="container col-center">
        <div class="facedone">
            <div class="rel">
                <CircularProgressBar></CircularProgressBar>
                <div class="avatar">
                    <img src="./assets/yosie.png" alt="">
                </div>
                <img src="./assets/doneicon.svg" alt="" class="doneicon" v-if="doneicon">
            </div>
            <div class="face3-text">
                <div class="face3-text1">Verifikasi Sukses</div>
                <div class="face3-text2">anda akan di arahkan ke laman ujian</div>
            </div>
        </div>

        <Teleport to="body">
            <Integrity1Popup v-if="open1" @integrity1="integrity1"></Integrity1Popup>
            <Integrity2Popup v-if="open2" @integrity2="integrity2"></Integrity2Popup>
        </Teleport>
    </div>
</template>
<script>
import CircularProgressBar from "./components/CircularProgressBar.vue";
import Integrity1Popup from "./Integrity1Popup.vue";
import Integrity2Popup from "./Integrity2Popup.vue";
export default {
    components: {
        Integrity1Popup, Integrity2Popup, CircularProgressBar
    },
    data() {
        return {
            open1: false,
            open2: false,
            doneicon: false
        }
    },
    methods: {
        integrity1() {
            this.open1 = false;
            this.open2 = true;
        },
        integrity2() {
            this.open2 = false;
            this.$router.push('/ujian-lobby');
        }
    },
    mounted() {
        setTimeout(() => {
            this.doneicon = true;
        }, 1380);
        setTimeout(() => {
            this.open1 = true;
        }, 2400);
    }
}
</script>
<style scoped>
svg {
    position: absolute;
    z-index: 10;
}

.facedone {
    text-align: center;
}

.avatar {
    background-color: #214395;
    display: inline-block;
    border-radius: 50%;
    width: 326px;
    height: 326px;
    overflow: hidden;

    img {
        width: 100%;
        margin-top: 31px;
    }
}

.rel {
    position: relative;
    display: inline-block;
}

.doneicon {
    position: absolute;
    right: -7px;
    bottom: -7px;
    z-index: 100;
}

.face3-text {
    margin-top: 38px;
}

.face3-text1 {
    font-size: 30px;
    font-weight: 600;
}

.face3-text2 {
    font-size: 18px;
    color: #5A5555;
}
</style>